import { launchBrowser } from "../../../src/firefox/interfaces/launchBrowser.js";
import { setStorage } from "../../setup.test.js";
import jest from "jest-mock";

describe("firefox/interfaces/launchBrowser.js", () => {
  describe("launchBrowser()", () => {
    it("should return false if the url scheme is not valid", async () => {
      console.error = jest.fn();
      const result = await launchBrowser("fake://example.com");
      expect(result).toEqual(false);
      expect(console.error).toHaveBeenCalled();
      console.error.mockRestore();
    });

    it("should return false and open the welcome page if there is no launch protocol", async () => {
      await setStorage("currentExternalBrowser", "");
      const result = await launchBrowser("https://example.com");
      expect(result).toEqual(false);
      expect(browser.tabs.create).toHaveBeenCalled();
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: browser.runtime.getURL("shared/pages/welcomePage/index.html"),
      });
    });

    it("should return true if there is a launch protocol", async () => {
      await setStorage("currentExternalBrowser", "test");
      const result = await launchBrowser("https://example.com");
      expect(result).toEqual(true);
      expect(
        browser.experiments.firefox_launch.launchBrowser,
      ).toHaveBeenCalled();
      expect(
        browser.experiments.firefox_launch.launchBrowser,
      ).toHaveBeenCalledWith("test", "https://example.com");
    });

    it("should return false if the browser is launched in private mode", async () => {
      console.error = jest.fn();
      const result = await launchBrowser("https://example.com", true);
      expect(result).toEqual(false);
      expect(console.error).toHaveBeenCalled();
      console.error.mockRestore();
    });
  });
});
