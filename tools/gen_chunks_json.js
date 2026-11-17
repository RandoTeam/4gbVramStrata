// Dump the chunk registry to JSON so the Python pipeline and the prompts use
// exactly the asset names the browser will accept. Run with bun.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../assets/chunks.js", import.meta.url), "utf8");
const factory = new Function("THREE", "POD", src + "\nreturn CHUNKS;");
const CHUNKS = factory({}, {});
process.stdout.write(JSON.stringify(CHUNKS.manifest(), null, 1) + "\n");
