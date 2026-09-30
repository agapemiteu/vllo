import Console from "./pages/Console";
import Room from "./pages/Room";
import Home from "./pages/Home";
import New from "./pages/New";
import Investigation from "./pages/Investigation";
import { roomOf } from "./lib/workspace";

const WS = "([a-z0-9]{6,32})";

export default function App() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const room = new RegExp(`^/room/${WS}/(p1|p2)$`).exec(path);
  if (room) return <Room ws={room[1]} slot={room[2]} />;
  const inv = new RegExp(`^/i/${WS}(?:/(p1|p2))?$`).exec(path);
  if (inv) return <Investigation ws={inv[1]} slot={inv[2] ? roomOf(inv[2]) : null} />;
  if (path === "/new") return <New />;
  if (path === "/console") return <Console />;
  return <Home />;
}
