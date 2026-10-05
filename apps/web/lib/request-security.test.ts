import { describe, expect, it } from "vitest";
import { hasSameOrigin } from "./request-security";
describe("cookie-authenticated mutation origin checks",()=>{
  const request=(origin?:string)=>new Request("http://localhost:3100/api/assistant/proposals",{method:"POST",headers:{host:"127.0.0.1:3100",...(origin ? {origin} : {})}});
  it("accepts the real browser host even when Next reconstructs a bind hostname",()=>expect(hasSameOrigin(request("http://127.0.0.1:3100"))).toBe(true));
  it.each([undefined,"https://untrusted.example","http://127.0.0.1:3101","https://127.0.0.1:3100","null"])("rejects foreign or missing origin %s",origin=>expect(hasSameOrigin(request(origin))).toBe(false));
});
