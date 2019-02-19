const validator = require("./validator");
/**
 * account 账户
 * phone 手机号
 * password  密码
 */
const isEmpty = validator.isEmpty;
const isLength = validator.isLength;

module.exports = function validateRegisterInput(value) {
	let ans = {isvalid: false, message: ''}

	if (isEmpty(value)) {
		ans.message = "接口参数不能为空";
		return ans;
	}
	if (typeof(value.nickname) !== 'string' || isEmpty(value.nickname) || !isLength(value.nickname, {min:2, max:10}) || /^[\d]$/.test(value.nickname[0])) {
		ans.message = "昵称格式错误"; return ans;
	}
	if (typeof(value.phone) !== 'string' || !validator.isPhone(value.phone)) {
		ans.message = "手机号格式错误"; return ans;
	}
	if (typeof(value.password) !== 'string' || isEmpty(value.password) || !isLength(value.password, {min:6, max:18})) {
		ans.message = "密码格式错误"; return ans;
	}
	return {isvalid: true, message: 'OK'}
}