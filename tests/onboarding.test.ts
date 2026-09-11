import { it, expect, vi } from "vitest";
import { onboarding } from "../src/onboarding";
import type { Env } from "../src/types";
const setup = (completed: string | null) => {
  const run = vi.fn();
  return {
    run,
    env: {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ onboarding_completed_at: completed }),
            run,
          }),
        }),
      },
    } as unknown as Env,
  };
};
it("shows the guide before a first staff page, preserving the destination", async () => {
  const { env } = setup(null);
  const r = await onboarding(
    new Request("https://showlet.example/record"),
    env,
    "owner",
  );
  expect(r?.status).toBe(302);
  expect(r?.headers.get("Location")).toBe("/library/help?next=%2Frecord");
});
it("does not intercept API work or returning staff", async () => {
  expect(
    await onboarding(
      new Request("https://showlet.example/library"),
      setup("done").env,
      "owner",
    ),
  ).toBeNull();
  expect(
    await onboarding(
      new Request("https://showlet.example/api/videos"),
      setup(null).env,
      "owner",
    ),
  ).toBeNull();
});
it("keeps help accessible after completion", async () => {
  const r = await onboarding(
    new Request("https://showlet.example/library/help"),
    setup("done").env,
    "owner",
  );
  expect(r?.status).toBe(200);
  expect(await r?.text()).toContain("Your first recording");
});
it("records completion only through POST", async () => {
  const { env, run } = setup(null);
  await expect(
    onboarding(new Request("https://showlet.example/api/onboarding"), env, "owner"),
  ).rejects.toMatchObject({ status: 405 });
  await onboarding(
    new Request("https://showlet.example/api/onboarding", { method: "POST" }),
    env,
    "owner",
  );
  expect(run).toHaveBeenCalledOnce();
});
