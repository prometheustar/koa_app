const Koa = require('koa');
const Router = require("koa-router");
const bodyParser = require('koa-bodyparser');
const static = require('koa-static');
const path = require("path");
const cors = require('koa2-cors');
const { initSocket } = require('./routes/ws/wsserver')

// 实例化 koa
const app = new Koa();
const router = new Router();

/**
 * 允许跨域，改由 nginx 支持跨域
 */
// app.use(cors({
//     origin: function (ctx) {
//         return "*"; // 允许来自所有域名请求
//         // return 'http://localhost:3001'; // 这样就能只允许 http://localhost:3001 这个域名的请求了
//     },
//     exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
//     maxAge: 5,
//     credentials: true,
//     allowMethods: ['GET', 'POST', 'OPTIONS'],
//     allowHeaders: ['Content-Type', 'Authorization', 'Accept']
// }))

// 服务端判断渲染卖家 React 页面
const sellerSSR = require('./routes/react-ssr/sellerSSR')
const customerSSR = require('./routes/react-ssr/customerSSR')
// const reactSSR = require('./routes/react-ssr/react-ssr.js')
app.use(sellerSSR)

/**
 * 静态文件目录
 */
app.use(static(path.resolve(__dirname, './views'), {
    maxage: 1000 * 60 * 60 * 24 * 30,  // Cache-Control: 缓存 30天
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
app.use(customerSSR)

app.on('error', (err, ctx) => {
    if (err.code === 'ECANCELED' || err.code === 'ECONNRESET') return console.log('报错了');
    console.error(`/app-${Date.now()}`, err);
});

const PORT = 5000
// listen 会返回 createServer http对象
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('koa_running...' + PORT);
    console.log('|--------------------------------|');
});

initSocket(server)

