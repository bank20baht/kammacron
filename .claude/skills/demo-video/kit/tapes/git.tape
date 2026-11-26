Output "clips/git.mp4"
Source "tapes/setup.tape"
Type "git log --oneline"
Sleep 300ms
Enter
Sleep 2s
Type "git diff --stat $(git rev-list --max-parents=0 HEAD)"
Sleep 300ms
Enter
Sleep 4.5s
