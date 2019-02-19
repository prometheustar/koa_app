const validator = require('./validator');

module.exports = function cslogin(value) {
	let ans = {
		isvalid: false,
		message: ''
	}
	if (validator.isEmpty(value)) {
		ans.message = "接口参数不能为空";
		return ans;
	}
	if (typeof(value.account) !== "string" || validator.isEmpty(value.account) || !validator.isLength(value.account,{min:2,max:25})) {
		ans.message = "账户格式错误"; 
		return ans;
	}
	if (typeof(value.password) !== "string" || validator.isEmpty(value.password) || !validator.isLength(value.password,{min:6,max:25})) {
		ans.message = "密码格式错误"; 
		return ans;
	}
	return {isvalid: true, message: 'OK'}
}