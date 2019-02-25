const Koa = require('koa');
const Router = require("koa-router");
const bodyParser = require('koa-bodyparser');
const jwt = require("jsonwebtoken");
const static = require('koa-static');
const path = require("path");

/**
 * 跨域
 * CORS是一个W3C标准，全称是"跨域资源共享"（Cross-origin resource sharing）。
 *下面以koa2-cors为例，
 */
const cors = require('koa2-cors');

const keys = require('./config/keys.js');

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

/**
 * 静态文件目录
 * / ==> /public/index.html
 */
app.use(static(path.resolve(__dirname, './views')));

// 解析post 请求体
app.use(bodyParser());

// 请求头 token 验证
app.use(async function passportToken(ctx, next) {
    try{
        const token = ctx.request.header.authorization || ctx.request.body.token;
        if (!token) {
            ctx.jwt = {passport: false, message: 'empty token'}
        }else {
            // 存在，解析
            jwt.verify(token, keys.tokenKey, (err, decoded) => {
                if (err) {
                    ctx.jwt = {passport: false, message: err.message};
                    return;
                }
                ctx.jwt = {passport: true, user: decoded}
            })
        }
    }
    catch(err){
        console.log('passportToken', err);
        ctx.jwt = {passport: false, message: err.message};
    }
    await next();
});

// 配置路由地址
const goods = require('./routes/api/goods');
const users = require('./routes/api/users');
const operator = require('./routes/api/operator');
const cs = require('./routes/api/cs');
router.use('/api/goods', goods);
router.use('/api/users', users);
router.use('/api/operator', operator);
router.use('/api/cs', cs);

// 配置路由
app.use(router.routes()).use(router.allowedMethods());

const port = process.env.PORT || 5000
app.listen(port, () => {
    console.log('|--------------------------------|');
	console.log('running...' + port);
});

app.on('error', (err, ctx) => {
    if (err.code === 'ECANCELED' || err.code === 'ECONNRESET') return console.log('报错了');
    console.log(err);
});