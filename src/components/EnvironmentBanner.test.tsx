import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

function ensureRobotsMeta(): HTMLMetaElement {
  let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", "noindex, nofollow");
  return meta;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/config/environment");
  document.querySelector('meta[name="robots"]')?.remove();
});

describe("EnvironmentBanner", () => {
  it("renders the 'test environment' banner when staging", async () => {
    ensureRobotsMeta();
    vi.doMock("@/config/environment", () => ({
      environment: { isStaging: true, isProduction: false, appEnv: "staging" },
    }));
    const { EnvironmentBanner } = await import("./EnvironmentBanner");
    render(<EnvironmentBanner />);
    expect(screen.getByTestId("environment-banner")).toHaveClass("h-7");
    expect(screen.getByText(/ambiente de teste/i)).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  it("renders nothing in production and promotes robots to index/follow", async () => {
    ensureRobotsMeta();
    vi.doMock("@/config/environment", () => ({
      environment: { isStaging: false, isProduction: true, appEnv: "production" },
    }));
    const { EnvironmentBanner } = await import("./EnvironmentBanner");
    const { container } = render(<EnvironmentBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("environment-banner")).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  });
});
