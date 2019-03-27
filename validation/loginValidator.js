const validator = require("./validator");

var isEmpty = validator.isEmpty;
var isLength = validator.isLength;
module.exports = function validateRegisterInput(data) {
	let ans = {
		isvalid: false,
		message: ''
	}
	if (isEmpty(data)) {
		ans.message = "接口参数不能为空";
		return ans;
	}
	if (typeof(data.account) !== 'string' || data.account.length < 2) {
		ans.message = "账户格式有误"; return ans;
	}
	if (typeof(data.password) !== 'string' || !isLength(data.password, {min:6,max:18})) {
		ans.message = "密码有误"; return ans;
	}
	if (validator.isPhone(data.account)) {
		return {isvalid: true, message: 'OK', way: 'phone'}
	} else if (isLength(data.account, {min:2, max:10})){
		return {isvalid: true, message: 'OK', way: 'nickname'}
	} else {
		ans.message = "账户格式有误"; return ans;
	}
}