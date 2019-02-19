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
	if (typeof(data.account) !== 'string' || isEmpty(data.account)) {
		ans.message = "账户格式有误"; return ans;
	}
	if (typeof(data.password) !== 'string' || isEmpty(data.password) || !isLength(data.password, {min:6,max:18})) {
		ans.message = "密码有误"; return ans;
	}
	if (validator.isPhone(data.account)) {
		data.way = 'phone';
		return {isvalid: true, message: 'OK'}
	} else if (isLength(data.account, {min:2, max:10})){
		data.way = 'nickname';
		return {isvalid: true, message: 'OK'}
	} else {
		ans.message = "账户格式有误"; return ans;
	}
}