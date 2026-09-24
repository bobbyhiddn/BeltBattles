import { describe, expect, it } from "vitest";
import { amzDate, canonicalQuery, EMPTY_SHA256, sha256Hex, signV4, uriEncode } from "../server/sigv4";

// Published vectors: "Signature Calculations for the Authorization Header: Transferring Payload
// in a Single Chunk (AWS Signature Version 4)", section "Examples: Signature Calculations",
// Amazon S3 API Reference (API Version 2006-03-01):
//   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
// That page renders client-side, so the values below were copied from the same section of the
// official PDF edition, http://awsdocs.s3.amazonaws.com/S3/20060301/s3-api-20060301.pdf, pages
// 24-30 (text extracted with pdftotext). Hex strings are verbatim; the PDF wraps long lines,
// which are joined here. As published, the PUT example's request line says test$file.txt while its
// canonical request (the input the signature was computed over) says /test%24file.text.
const AWS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  host: "examplebucket.s3.amazonaws.com",
  amzDate: "20130524T000000Z",
  scope: "20130524/us-east-1/s3/aws4_request",
};

const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const VECTORS = [
  {
    name: "GET Object (Range: bytes=0-9)",
    method: "GET", path: "/test.txt", query: [] as [string, string][],
    headers: { host: AWS.host, range: "bytes=0-9", "x-amz-content-sha256": EMPTY, "x-amz-date": AWS.amzDate },
    payloadHash: EMPTY,
    canonicalRequest: [
      "GET",
      "/test.txt",
      "",
      "host:examplebucket.s3.amazonaws.com",
      "range:bytes=0-9",
      "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date:20130524T000000Z",
      "",
      "host;range;x-amz-content-sha256;x-amz-date",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n"),
    canonicalHash: "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
    signature: "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    signedHeaders: "host;range;x-amz-content-sha256;x-amz-date",
  },
  {
    name: "PUT Object (test$file.text, REDUCED_REDUNDANCY)",
    method: "PUT", path: "/" + uriEncode("test$file.text", true), query: [] as [string, string][],
    headers: {
      date: "Fri, 24 May 2013 00:00:00 GMT", host: AWS.host,
      "x-amz-content-sha256": "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
      "x-amz-date": AWS.amzDate, "x-amz-storage-class": "REDUCED_REDUNDANCY",
    },
    payloadHash: sha256Hex("Welcome to Amazon S3."),
    canonicalRequest: [
      "PUT",
      "/test%24file.text",
      "",
      "date:Fri, 24 May 2013 00:00:00 GMT",
      "host:examplebucket.s3.amazonaws.com",
      "x-amz-content-sha256:44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
      "x-amz-date:20130524T000000Z",
      "x-amz-storage-class:REDUCED_REDUNDANCY",
      "",
      "date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class",
      "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
    ].join("\n"),
    canonicalHash: "9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d",
    signature: "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    signedHeaders: "date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class",
  },
  {
    name: "GET Bucket Lifecycle (?lifecycle)",
    method: "GET", path: "/", query: [["lifecycle", ""]] as [string, string][],
    headers: { host: AWS.host, "x-amz-content-sha256": EMPTY, "x-amz-date": AWS.amzDate },
    payloadHash: EMPTY,
    canonicalRequest: [
      "GET",
      "/",
      "lifecycle=",
      "host:examplebucket.s3.amazonaws.com",
      "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date:20130524T000000Z",
      "",
      "host;x-amz-content-sha256;x-amz-date",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n"),
    canonicalHash: "9766c798316ff2757b517bc739a67f6213b4ab36dd5da2f94eaebf79c77395ca",
    signature: "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543",
    signedHeaders: "host;x-amz-content-sha256;x-amz-date",
  },
  {
    name: "Get Bucket, List Objects (?max-keys=2&prefix=J)",
    method: "GET", path: "/", query: [["prefix", "J"], ["max-keys", "2"]] as [string, string][], // unsorted on purpose
    headers: { host: AWS.host, "x-amz-content-sha256": EMPTY, "x-amz-date": AWS.amzDate },
    payloadHash: EMPTY,
    canonicalRequest: [
      "GET",
      "/",
      "max-keys=2&prefix=J",
      "host:examplebucket.s3.amazonaws.com",
      "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date:20130524T000000Z",
      "",
      "host;x-amz-content-sha256;x-amz-date",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n"),
    canonicalHash: "df57d21db20da04d7fa30298dd4488ba3a2b47ca3a489c74750e0f1e7df1b9b7",
    signature: "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    signedHeaders: "host;x-amz-content-sha256;x-amz-date",
  },
];

describe("SigV4 signer: the published Amazon S3 examples", () => {
  it("hashes the example payloads as published", () => {
    expect(sha256Hex("")).toBe(EMPTY);
    expect(EMPTY_SHA256).toBe(EMPTY);
    expect(sha256Hex("Welcome to Amazon S3.")).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
  });

  it.each(VECTORS)("$name: canonical request, string to sign, signature and Authorization header", (v) => {
    const s = signV4({
      method: v.method, path: v.path, query: v.query, headers: v.headers, payloadHash: v.payloadHash,
      accessKeyId: AWS.accessKeyId, secretAccessKey: AWS.secretAccessKey, region: AWS.region,
    });
    expect(s.canonicalRequest).toBe(v.canonicalRequest);
    expect(sha256Hex(s.canonicalRequest)).toBe(v.canonicalHash);
    expect(s.stringToSign).toBe(["AWS4-HMAC-SHA256", AWS.amzDate, AWS.scope, v.canonicalHash].join("\n"));
    expect(s.signedHeaders).toBe(v.signedHeaders);
    expect(s.signature).toBe(v.signature);
    // The page prints "Credential=...,SignedHeaders=...,Signature=..."; we send ", " between the
    // parts as the AWS SDKs do (both are accepted). Same three values:
    expect(s.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${AWS.accessKeyId}/${AWS.scope}, SignedHeaders=${v.signedHeaders}, Signature=${v.signature}`,
    );
  });
});

describe("SigV4 signer: encoding details", () => {
  it("URI-encodes like SigV4: unreserved characters stay, the rest is upper-case %XX of UTF-8", () => {
    expect(uriEncode("test$file.text")).toBe("test%24file.text");
    expect(uriEncode("a b+c=d/e~f_g-h.i")).toBe("a%20b%2Bc%3Dd%2Fe~f_g-h.i");
    expect(uriEncode("ghosts/bb-0.4.0/d01/pool/g0123.json", true)).toBe("ghosts/bb-0.4.0/d01/pool/g0123.json");
    expect(uriEncode("é*")).toBe("%C3%A9%2A");
  });

  it("builds the canonical query from encoded, sorted names and values (continuation tokens included)", () => {
    expect(canonicalQuery([["prefix", "ghosts/bb-0.4.0/d01/"], ["list-type", "2"], ["continuation-token", "c+/=YQ=="]]))
      .toBe("continuation-token=c%2B%2F%3DYQ%3D%3D&list-type=2&prefix=ghosts%2Fbb-0.4.0%2Fd01%2F");
    expect(canonicalQuery([])).toBe("");
  });

  it("formats x-amz-date and trims header values", () => {
    expect(amzDate(new Date(Date.UTC(2013, 4, 24, 0, 0, 0, 123)))).toBe("20130524T000000Z");
    const a = signV4({
      method: "GET", path: "/", headers: { Host: AWS.host, "X-Amz-Date": AWS.amzDate, "x-amz-content-sha256": EMPTY, "x-note": "  a   b  " },
      payloadHash: EMPTY, accessKeyId: "k", secretAccessKey: "s", region: "auto",
    });
    expect(a.canonicalRequest).toContain("\nx-note:a b\n");
    expect(a.authorization).toContain("Credential=k/20130524/auto/s3/aws4_request");
    expect(() => signV4({ method: "GET", path: "/", headers: { host: "h" }, payloadHash: EMPTY, accessKeyId: "k", secretAccessKey: "s", region: "auto" }))
      .toThrow(/x-amz-date/);
  });
});
