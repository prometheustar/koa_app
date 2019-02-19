const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'sing520',
    server: '127.0.0.1', 
    database: 'Choice_Perfect'
}
const con_str = 'mssql://sa:sing520@127.0.0.1/Choice_Perfect';

/**
 * 流式传输
 * 传入 select sql语句
 * 返回查询结果集  对象数组
 * on row 监听返回行
 */
function executeReader(sql_str) {
	return new Promise((resolve, reject) => {
		sql.connect(config, err => {
			if (err) {
				return reject(err);
			}
			const request = new sql.Request();
			request.stream = true;
			request.query(sql_str);
			let resultTable = [];	// 结果表
		    request.on('row', row => {
		        //每个结果集会出发row事件，返回row信息
		        resultTable.push(row);
		    })
		    request.on('error', err => {
		        //监听error事件，可能被触发多次
		        reject(err);
		    })
			request.on('done', result => {
				sql.close();  //关闭连接
				resolve(resultTable);  // 返回结果
			})
		})
		sql.on('error', err => {
			sql.close();
			reject(err);
		})
	});
}

/**
 * ExecuteNoQuery 
 * 传入 update delete insert sql 语句
 * 返回受影响的行数
 */
function executeNoQuery(sql_str) {
	return new Promise((resolve, reject) => {
		sql.connect(config, err => {
		    new sql.Request().query(sql_str, (err, result) => {
				if (err) {
					return reject(err);
				}
				// 返回受影响的行数
		        resolve(result.rowsAffected[0])
		        sql.close();
		    })
		})

		sql.on('error', err => {
			sql.close();
		    reject(err);
		})
	});
}

module.exports = {
	executeReader,
	executeNoQuery
}

// 快速起步
/*
async function start() {
    try {
        await sql.connect(con_str)
        const result = await sql.query(`select * from users`)
        console.dir(result)
    } catch (err) {
        // ... error checks
        console.log(err);
    }
}
start();

sql.on('error', err => {
	console.log(err);
})
*/

/*
let insert = "insert into users(name,password,phone) values('网二','123456','13812345678');";
let select = "select * from users;"
// pool 连接池
new sql.ConnectionPool(config).connect().then(pool => {
    return pool.query(select)
}).then(result => {
    console.dir(result)
    //pool.close();
}).catch(err => {
	console.log(err);
})
*/