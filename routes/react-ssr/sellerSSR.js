const ReactSSR = require('react-dom/server')
const fs = require('fs')
const path = require('path')
const url = require('url')

const createApp = require('../../views/business/server-entry.js').default
let template = fs.readFileSync(path.join(__dirname, '../../views/business/index.html'), 'utf-8')

module.exports = async (ctx, next) => {
	const { pathname } = url.parse(ctx.request.url)
	if (!/^\/seller/.test(pathname)) {
		return await next()
	}
	console.log(pathname)
	try {
		const appString = ReactSSR.renderToString(createApp(null, decodeURIComponent(ctx.request.url), null))
		ctx.body = template.replace('<!--app-->', appString)
	}catch(err) {
		console.error('react-ssr --->', err.message)
	}
}