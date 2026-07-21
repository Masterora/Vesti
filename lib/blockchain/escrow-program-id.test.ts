import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const expectedProgramId = "ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck";

function readRepositoryFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("escrow program id", () => {
  it("keeps the program, Anchor config, and environment example aligned", () => {
    expect(readRepositoryFile("programs/vesti-escrow/src/lib.rs")).toContain(
      `declare_id!("${expectedProgramId}")`
    );
    expect(readRepositoryFile("Anchor.toml")).toContain(
      `vesti_escrow = "${expectedProgramId}"`
    );
    expect(readRepositoryFile(".env.example")).toContain(
      `ESCROW_PROGRAM_ID=${expectedProgramId}`
    );
  });
});
