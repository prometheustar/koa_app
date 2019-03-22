const Koa = require('koa');
const Router = require("koa-router");
const bodyParser = require('koa-bodyparser');
const static = require('koa-static');
const path = require("path");
const { initSocket } = require('./routes/ws/wsserver')
/**
 * 跨域
 * CORS是一个W3C标准，全称是"跨域资源共享"（Cross-origin resource sharing）。
 *下面以koa2-cors为例，
 */
const cors = require('koa2-cors');

// 实例化 koa
const app = new Koa();
const router = new Router();

/**
 * 允许跨域 
 */
app.use(cors({
    origin: function (ctx) {
        return "*"; // 允许来自所有域名请求
        // return 'http://localhost:3001'; // 这样就能只允许 http://localhost:3001 这个域名的请求了
    },
    exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
    maxAge: 5,
    credentials: true,
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept']
}))

// 服务端渲染 React 页面
const serverRender = require('./routes/react-ssr/react-ssr')
app.use(serverRender)

/**
 * 静态文件目录
 */
app.use(static(path.resolve(__dirname, './views'), {
    maxage: 3600,  // Cache-Control: 缓存 1小时
}));

// 解析post 请求体
app.use(bodyParser());

// 配置 API 路由地址
const goods = require('./routes/api/goods');
const users = require('./routes/api/users');
const operator = require('./routes/api/operator');
const order = require('./routes/api/order');
const cs = require('./routes/api/cs');
router.use('/api/goods', goods);
router.use('/api/users', users);
router.use('/api/operator', operator);
router.use('/api/order', order);
router.use('/api/cs', cs);

// 配置路由
app.use(router.routes()).use(router.allowedMethods());

app.on('error', (err, ctx) => {
    if (err.code === 'ECANCELED' || err.code === 'ECONNRESET') return console.log('报错了');
    console.error(`/app-${Date.now()}`, err);
});

const port = process.env.PORT || 80

// listen 会返回 createServer http对象
const server = app.listen(port, () => {
    console.log('koa_running...' + port);
    console.log('|--------------------------------|');
});

initSocket(server)

