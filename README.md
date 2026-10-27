# 3D 智能汽车仿真

一个在浏览器里运行的中文车辆展示 Demo。没有后端，也不连接真实车辆。鼠标、控制面板和文本指令共用同一份车窗状态；本机中文语音模型可用时，语音指令也走同一套状态。

## 功能

- 三分之四视角查看车辆，拖动旋转，滚轮缩放，按钮复位视角。
- 四扇侧窗可以单独打开、关闭、停止，或设置开度。玻璃向下移动表示打开。
- 点击车身上带亮边的侧窗，效果与右侧面板一致。
- 文本指令示例：`打开左前车窗`、`关闭全部车窗`、`左前车窗调到 30%`。
- 识别失败或指令无法理解时，车窗状态不会改变，并给出错误提示。
- 高质量模型加载失败时，自动退回简化车身，车窗控制仍然可用。

车头朝向前方。模型里的左侧车窗对应左前，右侧对应右前。

## 技术栈

- React 19、TypeScript、Vite
- Three.js、React Three Fiber
- 本地语音：vosk-browser 与中文小模型
- 测试：Vitest

## 启动

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173/ 。

```bash
npm test
npm run build
npm run preview
```

## 车辆模型

展示用的车身是 Khronos Car Concept。

- 本地路径：`public/vehicles/CarConcept.glb`
- 许可证：CC BY 4.0，说明见 `public/vehicles/CarConcept-LICENSE.md`
- 模型与贴图：Eric Chadwick / Darmstadt Graphics Group GmbH，2024
- Khronos 标志和商标不在该许可范围内

画面中的车身被调成浅蓝色，车顶和下部饰板为深蓝色。座椅仍使用模型原有的红色内饰。模型文件约 11 MB，已放在仓库中。

## 语音模型

中文语音包体积较大，并且写在 `.gitignore` 里，克隆后需要自己放到下面这个路径：

`public/models/vosk-model-small-cn-0.22.tar.gz`

使用的是 Vosk 的 `vosk-model-small-cn-0.22`。没有这个文件时，文本指令仍然可以控车。第一次点击「开始聆听」才会加载语音包，并请求麦克风权限。

## 目录

- `src/scene`：场景、展厅灯光、概念车加载和降级车身
- `src/vehicle`：唯一的车辆状态、车窗动画
- `src/panels`：车窗面板、日志和语音栏
- `src/commands`：文本指令解析与执行
- `src/speech`：本机语音识别
- `tests`：状态、指令和语音阶段测试
