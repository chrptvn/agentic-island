import { Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home.js";
import { WorldView } from "./pages/WorldView.js";
import { GetKey } from "./pages/GetKey.js";
import { Layout } from "./components/Layout.js";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/world/:id" element={<WorldView />} />
        <Route path="/get-key" element={<GetKey />} />
      </Route>
    </Routes>
  );
}
