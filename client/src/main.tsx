import { createRoot } from "react-dom/client";
import { getMissingRequiredEnv } from "./env";
import EnvErrorScreen from "./components/EnvErrorScreen";
import "./index.css";
import "./sentry";
import "./vitals";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
const missing = getMissingRequiredEnv();

if (missing.length > 0) {
  root.render(<EnvErrorScreen missingKeys={missing} />);
} else {
  import("./App")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch((error) => {
      console.error("[App] Failed to bootstrap application", error);
      root.render(<EnvErrorScreen missingKeys={[]} error={error} />);
    });
}
