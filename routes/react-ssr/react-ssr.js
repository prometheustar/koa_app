const ReactSSR = require('react-dom/server')
const fs = require('fs')
const path = require('path')
const url = require('url')

const createApp = require('../../views/server-entry.js').default
let template = fs.readFileSync(path.join(__dirname, '../../views/index.html'), 'utf-8')

const routes = [
	'/',
	'/register',
	'/login',
	'/search_product',
	'/search_products',
	'/product_detail',
	'/member',
	'/order',
	'/payorder',
]

module.exports = async (ctx, next) => {
	const { pathname } = url.parse(ctx.request.url)
	// 请求是 api 接口或静态文件
	if (/^\/api/.test(pathname) || /^\/image/.test(pathname) || /^\/static/.test(pathname)) {
		return await next()
	}
	// 请求不在 react 定义页面中
	if (routes.indexOf(pathname) === -1) {
		ctx.status = 404
		return ctx.body = '404 你请求的不存在'
	}
	try {
		const appString = ReactSSR.renderToString(createApp(null, decodeURIComponent(ctx.request.url), null))
		ctx.body = template.replace('<!--app-->', appString)
	}catch(err) {
		console.error('react-ssr--->', err.message)
	}
}