// Copies browser dependencies from node_modules into the static assets folder.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/js", { recursive: true });
copyFileSync("node_modules/htmx.org/dist/htmx.min.js", "public/js/htmx.min.js");
