import { CipherResponse } from "./cipher.response";

describe("CipherResponse", () => {
  it("preserves blob-encrypted cipher data", () => {
    const response = new CipherResponse({ data: "encrypted-blob" });

    expect(response.data).toBe("encrypted-blob");
  });

  it("ignores Vaultwarden's legacy structured cipher data", () => {
    const response = new CipherResponse({
      data: {
        fields: [],
        name: "encrypted-name",
        notes: "encrypted-notes",
        passwordHistory: [],
      },
    });

    expect(response.data).toBeUndefined();
  });
});
