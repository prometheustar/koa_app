/**
 * https://docs.open.alipay.com/270/alipay.trade.page.pay
 * 生成支付宝付款二维码
 */
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const md5 = require('md5')
const keys = require('./keys')

const alipaySdk = new AlipaySdk({
    gateway: 'https://openapi.alipaydev.com/gateway.do',  // 支付宝网关
    appId: keys.alipayAppId,
    privateKey: keys.alipayPrivateKey,
    alipayPublicKey: keys.alipayPublicKey,
    timeout: 5000,  // 网关超时时间，毫秒
    signType: 'RSA2',
    charset: 'utf-8',
});


module.exports = function alipay(ordernos, price) {
  return new Promise((resolve, reject) => {
    const formData = new AlipayFormData()
    const jsonOrders = JSON.stringify(ordernos)
    formData.setMethod('get')
    formData.addField('notifyUrl', 'http://118.126.108.36/api/order/alipay_notify') // 支付成功后支付宝回调地址
    formData.addField('bizContent', {
      outTradeNo: ordernos[0],
      productCode: 'FAST_INSTANT_TRADE_PAY',
      qrPayMode: '1',  // 4-返回一张二维码 0，1，2，3
      // qrcodeWidth: 300,  // 二维码宽度，仅在qrPayMode=4 生效
      totalAmount: price,
      subject: '优选 Choice_Perfect',
      // body: body,
      passbackParams: encodeURIComponent(jsonOrders + '^oo^' + md5(jsonOrders + keys.alipaySecret)), // 回传的参数 md5加密后 urlencode
      timeoutExpress: '1h'  // 最晚付款时间 3天，m 分，h 小时
    });
    alipaySdk.exec('alipay.trade.page.pay', {}, { formData })
    .then(result => {
      // result 为可以跳转到支付链接的 url, h835 * w500
      resolve(result)
    })
    .catch (err => {
      reject(err)
    })
  })
}
// 验证 app_id, passback_params md5(orderno + secret),
// strade_status: TRADE_SUCCESS