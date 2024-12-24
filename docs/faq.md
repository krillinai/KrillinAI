### 1. 看不到`app.log`配置文件，无法知道报错内容
Windows用户请将本软件的工作目录放在非C盘的文件夹。

### 2. 明明创建了配置文件，但还是报错“找不到配置文件”
确保配置文件名是`config.toml`，而不是`config.toml.txt`或其它。
配置完成后，本软件的工作文件夹的结构应该是这样的：
```
/── config/
│   └── config.toml
├── cookies.txt （<- 可选的cookies.txt文件）
└── krillinai.exe
```