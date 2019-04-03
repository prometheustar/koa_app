const validator = require("./validator");
const smsCodeValidator = require('./smsCodeValidator')
/**
 * account 账户
 * phone 手机号
 * password  密码
 */
const isEmpty = validator.isEmpty;
const isLength = validator.isLength;

module.exports = async function validateRegisterInput(value) {
	let ans = {isvalid: false, message: ''}

	if (isEmpty(value)) {
		ans.message = "接口参数不能为空";
		return ans;
	}
	if (typeof(value.nickname) !== 'string' || isEmpty(value.nickname) || !isLength(value.nickname, {min:2, max:10}) || /^[\d]$/.test(value.nickname[0])) {
		ans.message = "昵称格式有误"; return ans;
	}
	if (typeof(value.phone) !== 'string' || !validator.isPhone(value.phone)) {
		ans.message = "手机号格式有误"; return ans;
	}
	if (typeof(value.password) !== 'string' || !/^[\w,';)(!~·`\/\\{}"<>?+-=_.]{6,25}$/.test(value.password)) {
		ans.message = "密码格式有误"; return ans;
	}
	if (typeof(value.smscode) !== 'string' || !/^\d{5,6}$/.test(value.smscode)) {
		ans.message = '验证码格式有误'; return ans
	}
	let smscodeValid = { message: '验证码错误' }
	try {
		smscodeValid = await smsCodeValidator(value.smscode, value.phone)
	}catch(err) {
		console.error('registerValidator:', err.message)
		smscodeValid.message = err.message
	}
	if (!smscodeValid.isvalid) {
		ans.message = smscodeValid.message; return ans
	}
	return {isvalid: true, message: 'OK'}
}