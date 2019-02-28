/**
 * 连接 mysql
 * 提供 executeReader 方法执行 select
 * 提供 executeNoQuery 方法执行 update insert delete 语句
 */
const mysql = require('mysql');
const keys = require('./keys.js');

// 创建连接池，最多10个并行连接。
const pool = mysql.createPool({
	connectionLimit : 10,
	host: keys.mysqlhost,
	user: keys.mysqluser,
	password: keys.mysqlpwd,
	database: 'Choice_Perfect',
	charset: 'utf8'
});

/**
 * 传入 select sql语句
 * 返回查询结果集  对象数组
 */
function executeReader(sql_str) {
	return new Promise((resolve, reject) => {
		// 获得连接
		pool.getConnection((err, connection) => {
			if (err) return reject(err)
			connection.query(sql_str, (err, results, _) => {
				connection.release();  // 释放连接回连接池
				if (err) return reject(err)
				resolve(results);
			});
		});
	});
}

/**
 * executeReaderMany
 * 传入对象，{ product: 'select xx' }
 * 返回结果集
 */
function executeReaderMany(sql_strs) {
	return new Promise((resolve, reject) => {
		let key;
		let results = {};
		for (key in sql_strs) {
			(function(){
				const sql_key = key
				// 获得连接
				pool.getConnection((err, connection) => {
					if (err) return reject(err);
					connection.query(sql_strs[sql_key], (err, ans, _) => {
						connection.release();  // 释放连接回连接池
						if (err) return reject(err);
						results[sql_key] = ans
						end = true
						for (let i in sql_strs) {
							if (results[i] === undefined) {
								end = false
								break;
							}
						}
						if (end) resolve(results);
					});
				});
			}())
		}
	})
}

/**
 * ExecuteNoQuery 
 * 传入 update delete insert sql 语句
 * 返回受影响的行数
 */
function executeNoQuery(sql_str) {
	return new Promise((resolve, reject) => {
		executeReader(sql_str)
			.then(result => {
				resolve(result.affectedRows);
			})
			.catch(err => {
				reject(err);
			});
	});
}

/**
 * executeNoQueryMany
 * 传入对象，{ product: 'select xx' }
 * 返回受影响的行数对象
 */
function executeNoQueryMany(sql_strs) {
	return new Promise((resolve, reject) => {
		let key;
		let results = {};
		for (key in sql_strs) {
			(function() {
				const sql_key = key
				// 获得连接
				pool.getConnection((err, connection) => {
					if (err) return reject(err);
					connection.query(sql_strs[sql_key], (err, ans, _) => {
						connection.release();  // 释放连接回连接池
						if (err) return reject(err);
						results[sql_key] = ans.affectedRows
						end = true
						for (let i in sql_strs) {
							if (results[i] === undefined) {
								end = false
								break;
							}
						}
						if (end) resolve(results);
					});
				});
			}())
		}
	})
}

module.exports = {
	executeReader,
	executeNoQuery,
	executeReaderMany,
	executeNoQueryMany
}

/*
  OkPacket {
  fieldCount: 0,
  affectedRows: 2,
  insertId: 9,
  serverStatus: 2,
  warningCount: 0,
  message: '&Records: 2  Duplicates: 0  Warnings: 0',
  protocol41: true,
  changedRows: 0 }
 */

 /**
  * 因 mysql 版本太高，密码验证方式更新，客户端版本太低，手动修改密码验证方式
  * ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'yourpassword';
  */
	 