const validator = require('./validator');

module.exports = function csregister(value) {
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
	if (typeof(value.name) !== "string" || validator.isEmpty(value.name) || !validator.isLength(value.name,{min:2,max:10})) {
		ans.message = "姓名格式错误"; 
		return ans;
	}
	if (typeof(value.crea_account) !== "string" || validator.isEmpty(value.crea_account) || !validator.isLength(value.crea_account,{min:3,max:25})) {
		ans.message = "创建者账户格式错误"; 
		return ans;
	}
	if (typeof(value.crea_password) !== "string" || validator.isEmpty(value.crea_password) || !validator.isLength(value.crea_password,{min:6,max:25})) {
		ans.message = "创建者密码格式错误"; 
		return ans;
	}
	if (value.overman) {
		if (!(value.overman === '0' || value.overman === '1')) {
			ans.message = "总管理员表示格式错误"; 
			return ans;
		}
	}else {
		value.overman = "0";
	}
	return {isvalid: true, message: "OK"}
}