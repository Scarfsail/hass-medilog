import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Build the bundle once before the suite so tests run against current source. */
export default function globalSetup(): void {
    // Always rebuild — cheap (~200ms) and guarantees the tests reflect the source.
    execSync("npm run build", { cwd: resolve(__dirname, ".."), stdio: "inherit" });
    const bundle = resolve(__dirname, "../../custom_components/medilog/frontend_compiled/medilog-card.js");
    if (!existsSync(bundle)) {
        throw new Error(`Bundle not found after build: ${bundle}`);
    }
}
