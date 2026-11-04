# Windows 0.10.1 正式发布文件

发布来源：已上线 Web 0.10.1（`a465d1b5`）的冻结资源，主文件 `assets/main-j_8dspEz.js`，SHA-256 `4305c12633a902b65f6ef942435a06f0ab3d74fd46ad1da4bed375980cbf3e5e`。未取用工作区后续 Web 0.10.2 测试改动。

- 安装版：198,320,696 B，SHA-256 `8d7b116bdb6e9e588d3ee1c879b0e6199a05d89a4e0401fc7c3c7a16dc27179a`。
- 便携版：198,088,809 B，SHA-256 `4757bc9d90d2f67f4315671f1a0e6cd30853191b1b558e2715b455181bcdfd57`。
- [安装版](https://kotobud.com/downloads/KotoBud-0.10.1-Windows-x64-Setup.exe)、[便携版](https://kotobud.com/downloads/KotoBud-0.10.1-Windows-x64-Portable.exe)、[SHA-256 清单](https://kotobud.com/downloads/SHA256SUMS-0.10.1.txt)。

1,554 个包内 Web 文件逐字节匹配，ASAR 版本和入口与源码一致。[文件核对](package-verification.json)。隔离正式包验证设置版本、三种宽屏模式、下册第 48 课离线答题、完整进程重启恢复、五十音本地解码播放和逐笔查看通过；实际便携 EXE 的隔离启动通过。[主程序交互](grammar-acceptance.json)、[便携启动](portable-acceptance.json)。安装器未执行，真实覆盖升级仍未验收。

本轮发布及公网核验见[跨端发布记录](../../../../kotobud-review/cross-client-release-2026-11-04/DELIVERY.md)。应用身份和用户数据位置沿用既有配置。语法进度仍按账号保存在本机；没有生成新 TTS，也没有数据库迁移。
