import React from "react";
import { createRoot } from "react-dom/client";

const SidePanel: React.FC = () => (
  <div style={{
    padding: 20,
    backgroundColor: "#0B0714",
    color: "#fff",
    fontFamily: "system-ui",
    minHeight: "100vh",
  }}>
    <h2 style={{ color: "#E7C55F" }}>🗿 Marcus</h2>
    <p style={{ color: "#98979C", marginTop: 10, fontSize: 13 }}>
      Side panel chat coming in Phase 3.
    </p>
  </div>
);

createRoot(document.getElementById("root")!).render(<SidePanel />);
