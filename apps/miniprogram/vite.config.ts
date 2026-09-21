import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  plugins: [
    uni(),
    {
      name: "inject-wx-appid",
      closeBundle() {
        const appid = process.env.VITE_WX_APPID || process.env.WX_APPID;
        if (!appid) return;
        const projectConfigPath = path.resolve(__dirname, "dist/build/mp-weixin/project.config.json");
        const devProjectConfigPath = path.resolve(__dirname, "dist/dev/mp-weixin/project.config.json");
        for (const p of [projectConfigPath, devProjectConfigPath]) {
          if (fs.existsSync(p)) {
            try {
              const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
              cfg.appid = appid;
              fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
              console.log(`[inject-wx-appid] Updated appid to ${appid} in ${p}`);
            } catch (err: any) {
              console.warn(`[inject-wx-appid] Failed to update appid: ${err.message}`);
            }
          }
        }
      }
    }
  ]
});
