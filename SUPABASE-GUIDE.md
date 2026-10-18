# Supabase 接入指南（一次性，约 10 分钟）

Star Jar 的跨设备自动同步需要一个云端数据库。这个方案**完全免费**，而且**不需要买服务器**——你创建一个 Supabase 项目，把两个值填进应用，同步就生效了。

数据存在你自己建的 Supabase 项目里，只有你的账号能看到（数据库的行级安全策略强制保证这一点）。

---

## 第 1 步 · 注册并创建项目

1. 打开 <https://supabase.com>，注册（免费）
2. 点 **New project**
3. 随便起个名字，例如 `star-jar`
4. **数据库密码**：自己设一个，**记下来**（本流程用不到，但后台可能会问）
5. 地区选离你近的（香港 / 新加坡 / 东京）
6. 点 **Create new project**，等约 1 分钟建好

## 第 2 步 · 建表（只做一次）

1. 左侧菜单点 **SQL Editor**，点 **New query**
2. 把 **`SUPABASE-SETUP.txt`** 的全部内容粘贴进去
   （浏览器打开 https://superstar-star-jar.app.workbuddy.host/SUPABASE-SETUP.txt 就能看到，
   本地文件夹里也有同名文件）
3. 点右下角 **Run**

看到 `Success. No rows returned` 就对了。

> 这段 SQL 建两张表并开启了安全策略：只有登录用户能读写自己的数据；事件表**只允许新增**，不允许修改或删除。

## 第 3 步 · 允许登录后跳回来（**两处都要改**）

1. 左侧菜单 **Authentication → URL Configuration**
2. **Site URL** 填：
   ```
   https://superstar-star-jar.app.workbuddy.host
   ```
3. **Redirect URLs** 里**添加**这一行（注意是「添加」，别覆盖原有的）：
   ```
   https://superstar-star-jar.app.workbuddy.host
   ```
4. 确认 **Authentication → Providers → Email** 是**打开**的（默认开）

> ⚠️ **Site URL 和 Redirect URLs 是两个不同的框，只改一个不行。**
>
> 新建项目时 **Site URL 默认是 `http://localhost:3000`**。如果只加了 Redirect URLs
> 而没改 Site URL，登录邮件里的链接仍会指向 `localhost:3000`，
> 点开后手机上就是 **「找不到网页 / HTTP ERROR 404」**。
>
> 判别方法：看邮件里那个链接指向哪个地址。出现 `localhost:3000` 就是这一步没做。

### 邮件里链接打不开？

| 现象 | 原因 | 处理 |
|---|---|---|
| 链接指向 `localhost:3000` | Site URL 没改 | 回到上面第 2 步改 Site URL |
| 链接指向本应用域名但提示 404 | 页面已重新发布，Service Worker 缓存 | 删掉桌面图标，从链接重装 |
| 邮件根本没来 | 免费额度限流，或进了垃圾箱 | 等几分钟再试一次；看垃圾箱 |

## 第 4 步 · 拿到两个值

1. 左侧菜单最下方 **Project Settings → API**（老界面叫 API Settings）
2. 复制这两个：
   - **API URL** —— 形如 `https://abcdefgh.supabase.co`（旧版界面叫 Project URL）
   - **publishable key** —— 以 `sb_publishable_` 开头（新）或 `eyJ` 开头（旧，叫 anon public）

> ⚠️ 只要 **publishable key**（新版本布局也叫 **anon public**）这一把。
> **绝对不要**把 **secret key**（新名 `sb_secret_`，旧名 `service_role`）填进去。
> 它会绕过所有行级安全规则，意味着任何人拿到它都能读你的全部数据。
> 应用现在会自动拒绝这种密钥，并会告诉你它为什么不能用。

> **项目 URL 在哪里：** Project Settings → API 页面。新版后台它的名字叫 **API URL**（以前叫 Project URL），
> 格式是 `https://你的随机串.supabase.co`。“API URL”就是对的，不要去找别的地方。

## 第 5 步 · 填进应用

1. 打开 <https://superstar-star-jar.app.workbuddy.host/>
2. 滚到 **Everything that happened** 卡片，点 **Cloud account**
3. 粘贴 **API URL** 和 **publishable key**
4. 点 **Connect**

看到「Cloud account connected」就成了。

如果报错，提示会直接告诉你原因：

| 提示 | 原因 |
|---|---|
| 不像 Supabase 项目地址 | URL 抄错了或漏了 `https://` |
| tables are not ready | 第 2 步的 SQL 没跑成功 |
| anon key was rejected | 第 4 步的 key 抄错了 |
| 15 秒没响应 | URL 不对，或网络问题 |

---

## 第 6 步 · 在每台设备上登录

每台设备各做一次：

1. 打开网址 → 右栏 **☁️ Keep in sync**
2. 填家长邮箱 → 点 **Email me a sign-in link**
3. 去邮箱点那封邮件里的链接 → 自动跳回应用并登录
4. 另一台设备重复一遍

登录后勾任务，另一台点一下就同步过去了。

---

## 几个要知道的事

**免费额度够用。** 一个家庭的数据很小（一年也就几 MB），远低于免费额度。

**但邮件有发送频率限制。** Supabase 免费版每个项目每小时只能发几封登录邮件。两台设备各登录一次没问题，但如果反复点「再发一次」可能超限，等一小时即可。面板会明确提示。

**密码不需要。** 用的是「魔术链接」——点邮件里的链接直接登录。孩子那边不需要任何操作，也不需要记密码。

**数据是私有的。** anon key 本来就是设计给公开网页用的，它本身没有任何权限；真正的防护在数据库的行级安全策略里，别人拿不到你的数据。

**数据存在云上。** 这是跨设备同步的代价。如果哪天不想放在云上，在应用里点 **Disconnect**，数据回到各设备本地，之前说的 Export / Import 方式仍然可用。

---

## 如果你想撤销

Supabase 后台 **Project Settings → General → Delete project**。删了之后应用会连不上，数据只留在各设备本地——不会丢，只是不能再自动同步了。

## 常见问题 · 免费项目会被暂停

Supabase **免费项目如果一周内使用太少，会被自动暂停** —— 这是他们的省钱策略，不是出错了。

- 暂停后 API 停止响应，同步会失败，但**数据不会丢**
- 恢复方法：登录 supabase.com → 点 **Resume project**，**一年内**都能恢复，数据和配置原样回来
- 暂停前约一周会发邮件提醒
- **你的应用每天勾任务就会自动同步**，这就构成活动，通常不会触发暂停

> 出门几天没人用，或孩子长时间没打开，才可能碰上。
> 收到提醒邮件后，进Supabase 打开一下项目就能解除。

