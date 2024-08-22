// get user transcript
// store it into a cache that's waiting for the server to fetch it
// if the server fetches the current cache or if too much time has elapsed then shut clear cache
// get user transcript
// store it into a cache that's waiting for the server to fetch it
// if the server fetches the current cache or if too much time has elapsed then shut clear cache

const PLAYER_REGISTRY_TIMEOUT = 1 * 60 * 1000; // every 1 minute
const PORT = 8080;

type RobloxUser = {
  name: string,
  id: string,
}

type Player = {
  robloxData?: RobloxUser
  transcripts?: string[],
  isRegistered: boolean,
  createdAt: number,
}

type PlayerRegistry = { [code: string]: Player } 

const playerRegistry: PlayerRegistry = {};


// TODO: Upgrade this because this can be brute-forced by bad-actors
function generatePlayerCode() {
  const code = 1000 + Math.floor(Math.random() * 8999);
  // if the code is already registered than generate a new one
  if ( playerRegistry[code] === undefined ) return `${code}`; 
  return generatePlayerCode();
}

function cleanUpRegistry() {
  const now = Date.now();
  for (const code in playerRegistry) {
    const { createdAt, isRegistered } = playerRegistry[code];
    if (isRegistered || now - createdAt < PLAYER_REGISTRY_TIMEOUT) continue; // ignore registered accounts
    delete playerRegistry[code];
  }
}

const CORS_HEADERS = {
  headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  },
};

// TODO: Add a rate-limit
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    const wsData = { data: { code: url.searchParams.get("code") } };
    if (server.upgrade(req, wsData)) {
      return; // do not return a Response
    }

    if (url.pathname === "/register/browser") {
      const code = generatePlayerCode();
      playerRegistry[code] = { isRegistered: false, createdAt: Date.now() };

      return Response.json({ code }, CORS_HEADERS);
    } 
    else if (req.method === "POST" && url.pathname === "/register/roblox")  {
      const { code, ...data } = await req.json() as RobloxUser & { code: string };
  
      if (!playerRegistry[code]) return new Response("Invalid code provided.", { status: 404, ...CORS_HEADERS });
      if (playerRegistry[code].isRegistered) return new Response("Code is already registered with another player.", { status: 404, ...CORS_HEADERS });

      console.log(`Registering user with code ${ code }`, data);

      playerRegistry[code] = {
        ...playerRegistry[code],
        robloxData: {
          id: data.id,
          name: data.name,
        },
        isRegistered: true,
      };
    } 
    else if (req.method === "GET" && url.pathname === "/fetch-transcripts") {
      const transcriptsData: { [key: string]: string[] } = {};

      for (const [code, player] of Object.entries(playerRegistry)) {
        const playerId = player.robloxData?.id || code;
        transcriptsData[playerId] = player.transcripts || [];
      }
    
      return Response.json(transcriptsData, CORS_HEADERS);
    }

    return new Response("This is a message!", CORS_HEADERS)
  },

  websocket: {
    maxPayloadLength: 1024 * 1024 * 1, // Max 1 MB payload
    open(ws) {
      const { code } = ws.data as { code: string };
      if ( !playerRegistry[code] || !playerRegistry[code].isRegistered )  return ws.close(1011, "Code is not registered.");

      ws.send("Socket opened!");
    },
    // Removes player from the registry once the websocket is closed
    close(ws) {
      console.log("Disconnected, removing player from the registry.");
      const { code } = ws.data as { code: string };
      delete playerRegistry[code];
    },
    message(ws, message) {
      const transcript = message as string
      const { code } = ws.data as { code: string };
      if (!code || !transcript) return ws.close(1011, "Incorrect data was parsed to the socket.");

      console.log(transcript);

      playerRegistry[code].transcripts?.push( transcript );
    }
  }
});

setInterval(() => {
  cleanUpRegistry();
}, PLAYER_REGISTRY_TIMEOUT);

console.log(`Running on http://localhost:${server.port} ws://localhost:3000`);