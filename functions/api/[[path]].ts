// Cloudflare Pages Functions 适配器
// 只有当你的站点是「Cloudflare Pages」项目（而不是 Workers）时才需要这个文件。
// 作用：把 Pages 的 /api/* 请求转交给同一套 Worker 代码处理。
//
// 用在 Pages 时还需要：
//   Pages 项目 → Settings → Functions → D1 database bindings
//   变量名填 DB，选择 blog-db，然后 Retry deployment
//
// 如果你的站点是 Workers（wrangler.toml 里有 main 入口），这个文件不会被用到，可以忽略。

import worker from "../../api/src/index";

export const onRequest = (context: any) => {
    return (worker as any).fetch(context.request, context.env, context);
};
