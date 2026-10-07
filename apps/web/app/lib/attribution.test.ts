import { afterEach, describe, expect, it } from "vitest";
import {
  anonymousId,
  captureTouch,
  currentAttribution,
  touchFromUrl,
} from "./attribution";

afterEach(() => window.localStorage.clear());

describe("attribution", () => {
  it("reads utm, club and referral codes from the link", () => {
    const at = new Date("2026-10-07T10:00:00Z");
    expect(
      touchFromUrl(
        new URL(
          "https://pf.test/start?utm_source=instagram&utm_campaign=autunno&club=padel-nord&ref=abc23456",
        ),
        at,
      ),
    ).toEqual({
      source: "instagram",
      campaign: "autunno",
      club: "padel-nord",
      ref: "abc23456",
      landingPath: "/start",
      at: at.toISOString(),
    });
    expect(touchFromUrl(new URL("https://pf.test/start"))).toBeNull();
  });

  it("keeps the first source and updates the last one", () => {
    captureTouch(new URL("https://pf.test/start?club=padel-nord"));
    captureTouch(new URL("https://pf.test/start"));
    captureTouch(new URL("https://pf.test/start?utm_source=newsletter"));
    const attribution = currentAttribution();
    expect(attribution.firstTouch).toMatchObject({ club: "padel-nord" });
    expect(attribution.lastTouch).toMatchObject({ source: "newsletter" });
    expect(attribution.lastTouch?.club).toBeUndefined();
  });

  it("uses one stable anonymous id per browser", () => {
    const id = anonymousId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(anonymousId()).toBe(id);
    expect(currentAttribution()).toEqual({ anonymousId: id });
  });
});
