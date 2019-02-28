const KoaRouter = require('koa-router');
const router = new KoaRouter();
const Decimal = require('decimal.js-light')

const db = require('../../config/mysqldb.js')
const tools = require('../../config/tools')
const tokenValidator = require('../../validation/tokenValidator')
const validator = require('../../validation/validator')

// 设置 Decimal 计算精度
Decimal.set({
  precision: 10,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21
});

/**
 * @route GET /api/users/submit_order
 * @props  goodDetailIds(intArr) numbers(intArr) messages(stringArr) addressId(int)
 * @access 携带 token 访问
 */
router.post('/submit_order', async ctx => {
	// token 验证
	const tokenValid = tokenValidator(ctx)
	if (!tokenValid.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	// 接口参数验证
	const param = ctx.request.body
	const orderValid = validator.submitOrderValidator(param)
	if (!orderValid.isvalid) {
		return ctx.body = {success: false, message: orderValid.message, code: '1002'}
	}
	// 验证通过，插入数据库
	const orderno = tools.getOrderno()
	let goodDetailSql = []
	// 根据 detailId 查询商品详情
	for (let i = 0, len = param.goodDetailIds.length; i < len; i++) {
		goodDetailSql[i] = `select _id,amount,price from tb_goodDetail where _id=${param.goodDetailIds[i]} and state=0 and amount>0;`
	}
	try {
		// 进行地址验证，必须是登录用户自己的收货地址
		goodDetailSql.address = `select _id from tb_address where _id=${param.addressId} and mid=${tokenValid.payload.userId};`
		const goodDetailAns = await db.executeReaderMany(goodDetailSql)
		if (goodDetailAns.address.length < 1) {
			return ctx.body = {success: false, message: '收货地址异常', code: '1011'}
		}
		// 验证结果，生成 insertOrderDetailSql
		let insertOrderDetailSql = 'insert into tb_orderDetail(orderno,goodDetailId,price,number,message) values'
		let updateGoodDetail = [] // 更新库存量
		let sumPrice = new Decimal(0)  // 使用 Decimal 计算价格
		for (let i = 0, len = param.numbers.length; i < len; i++) {
			if (goodDetailAns[i].length < 1 || goodDetailAns[i][0].amount < param.numbers[i]) {
				return ctx.body = {success: false, message: '商品未在售或数量超过库存', code: '1002'}
			}
			updateGoodDetail[i] = `update tb_goodDetail set amount=amount-${param.numbers[i]} where _id=${goodDetailAns[i][0]._id};`
			let end = i === len-1 ? ';' : ','
			let price = new Decimal(goodDetailAns[i][0].price).times(param.numbers[i])
			sumPrice = sumPrice.plus(price)
			insertOrderDetailSql += `('${orderno}',${goodDetailAns[i][0]._id},${price.toNumber()},${param.numbers[i]},'${param.messages[i]}')${end}`
		}
		// 生成 insertOrderSql
		let insertOrderSql = `insert into tb_order(orderno,mid,sumPrice,addressId) values('${orderno}',${tokenValid.payload.userId},${sumPrice.toNumber()},${param.addressId});`
		// 执行插入语句
		// const insertAns = await db.executeNoQueryMany({
		// 	...updateGoodDetail,  // goodDetail 库存减一
		// 	orderDetailAns: insertOrderDetailSql,  // lenth = param.numbers.length
		// 	orderAns: insertOrderSql,
		// })
		console.log({
			...updateGoodDetail,  // goodDetail 库存减一
			orderDetailAns: insertOrderDetailSql,  // lenth = param.numbers.length
			orderAns: insertOrderSql,
		})
		console.log(sumPrice.toString())
		// 执行成功后返回付款二维码，金额
		ctx.body = insertOrderDetailSql
	}catch(err) {
		console.error('/api/users/submit_order', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

// 支付宝回调接口
router.post('/alipay_notify', async ctx => {
	console.log('post /alipay_notify')
	console.log(new Date())
	console.log(ctx.url)
	console.log(ctx.request.body)
})

router.get('/alipay_notify', async ctx => {
	console.log('get /alipay_notify')
	console.log(new Date())
	console.log(ctx.url)
	console.log(ctx.request.body)
})

module.exports = router.routes()