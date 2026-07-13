/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
	resolve(process.cwd(), "src/index.css"),
	"utf8",
);

describe("global stylesheet", () => {
	it("includes Streamdown utilities in Tailwind's source scan", () => {
		expect(stylesheet).toContain(
			'@source "../node_modules/streamdown/dist/*.js";',
		);
	});

	it("does not globally override Markdown element styles", () => {
		for (const element of ["h1", "h2", "p", "code"]) {
			expect(stylesheet).not.toMatch(
				new RegExp(`^\\s*${element}(?:\\s*,|\\s*\\{)`, "m"),
			);
		}
	});
});
