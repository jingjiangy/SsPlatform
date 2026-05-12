# git-push

将当前改动提交并推送到远程主分支。

## 使用场景
用户说"push 代码"、"提交改动"、"推送到主分支"时触发。

## 执行步骤
1. 运行 `git status` 查看改动文件
2. 询问用户 commit message（如果用户没有提供）
3. `git add` 用户确认的文件
4. `git commit -m "<message>"`
5. `git push origin main`

## 注意事项
- 推送前展示改动文件列表，让用户确认
- 不要 push .env 文件（如果未被 .gitignore 排除，提醒用户）
- 不使用 --force
