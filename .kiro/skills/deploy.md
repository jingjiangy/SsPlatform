# deploy

一句话将本地代码部署到生产服务器，部署完成后报告结果和访问地址。

## 触发方式
用户说"部署"、"deploy"、"上线"、"发布到服务器"时触发。

## 服务器信息
- 地址：192.168.31.40
- 用户：jingjiang
- 项目路径：~/project/SsPlatform
- 服务端口：8077

## 执行步骤

1. 本地 push 最新代码到 main 分支（如有未提交改动，先询问用户）
2. SSH 到服务器拉取最新代码：
   ```
   ssh jingjiang@192.168.31.40 "cd ~/project/SsPlatform && git pull origin main"
   ```
3. 在服务器上执行部署脚本：
   ```
   ssh jingjiang@192.168.31.40 "cd ~/project/SsPlatform && bash start.sh"
   ```
4. 等待 10 秒后检查服务是否启动成功：
   ```
   ssh jingjiang@192.168.31.40 "lsof -ti :8077 && echo 'running' || echo 'failed'"
   ```
5. 根据检查结果告知用户：
   - 成功：输出"部署成功 ✓"，并给出访问地址 https://192.168.31.40:8077
   - 失败：输出"部署失败"，并打印最后 30 行日志供排查：
     ```
     ssh jingjiang@192.168.31.40 "tail -30 ~/project/SsPlatform/logs/backend.log"
     ```

## 注意事项
- 部署前确认本地代码已 push，否则服务器 git pull 拉不到最新改动
- start.sh 会自动 kill 旧进程再启动，无需手动停服务
- 部署过程需要几分钟（前端构建耗时较长），耐心等待
