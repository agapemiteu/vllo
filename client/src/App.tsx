import Console from "./pages/Console";
import Room from "./pages/Room";
import Home from "./pages/Home";
import New from "./pages/New";
import Investigation from "./pages/Investigation";

export default function App() {
  const path = location.pathname;
  const room = /^\/room\/(daniel|tunde)\/?$/.exec(path);
  if (room) return <Room id={room[1]} />;
  const inv = /^\/i\/(daniel|tunde)\/?$/.exec(path);
  if (inv) return <Investigation id={inv[1] as "daniel" | "tunde"} />;
  if (path.startsWith("/new")) return <New />;
  if (path.startsWith("/console")) return <Console />;
  return <Home />;
}
