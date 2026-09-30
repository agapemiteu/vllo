import Console from "./pages/Console";
import Room from "./pages/Room";
import Home from "./pages/Home";

export default function App() {
  const path = location.pathname;
  const room = /^\/room\/(daniel|tunde)\/?$/.exec(path);
  if (room) return <Room id={room[1]} />;
  if (path.startsWith("/console")) return <Console />;
  return <Home />;
}
