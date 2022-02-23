## trading zoo sequelize models


#### usage example


```javascript

const models = require('trading-zoo-node-models');

(async function(){
  const connection = await models.connect({
    database: 'trading_zoo_db',
    user: '',
    password: '',
    host: 'localhost'
    // logger: loggerInstance
  });
  // contains all models
  console.log(Object.keys(connection.models));

  // attempt simple findOrCreate
  console.log(connection.models.Accounts.findOrCreate)
  let account = await connection.models.Accounts.findOrCreate({ where: { member_id: 1234 }, defaults: { baz: 'zoo'}});
  console.log(account)
})()

```



```javascript
import { Accounts } from '@bct/trading-zoo-node-models';

Accounts.findAll();
```



