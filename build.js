const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

class BuildManager {
    constructor() {
        this.projectRoot = __dirname;
        this.buildDir = path.join(this.projectRoot, 'dist');
        this.pkgConfig = {
            name: 'LocalDrop',
            version: '1.0.0',
            description: '局域网内容分享平台',
            main: 'server.js',
            bin: 'server.js',
            pkg: {
                targets: [
                    'node18-win-x64'
                ],
                outputPath: 'dist',
                assets: [
                    'public/**/*',
                    'public/index.html',
                    'public/script.js',
                    'public/style.css'
                ]
            }
        };
    }

    // 清理构建目录
    cleanBuildDir() {
        console.log('🧹 清理构建目录...');
        if (fs.existsSync(this.buildDir)) {
            try {
                // 先尝试删除可能正在使用的 exe 文件
                const exeFile = path.join(this.buildDir, 'LocalDrop.exe');
                if (fs.existsSync(exeFile)) {
                    try {
                        fs.unlinkSync(exeFile);
                        console.log('  ✓ 删除旧的 exe 文件');
                    } catch (error) {
                        console.log('  ⚠️  无法删除旧的 exe 文件，可能正在运行');
                        console.log('  💡 请关闭正在运行的 LocalDrop.exe 后重试');
                        throw new Error('请关闭正在运行的 LocalDrop.exe 后重试');
                    }
                }
                fs.rmSync(this.buildDir, { recursive: true, force: true });
            } catch (error) {
                console.error('  ❌ 清理目录失败:', error.message);
                throw error;
            }
        }
        fs.mkdirSync(this.buildDir, { recursive: true });
    }

    // 复制必要文件到构建目录
    copyFiles() {
        console.log('📁 复制项目文件...');
        
        // 只复制运行时必需的文件
        const filesToCopy = [
            'server.js',
            'package.json'
        ];

        filesToCopy.forEach(file => {
            const srcPath = path.join(this.projectRoot, file);
            const destPath = path.join(this.buildDir, file);
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`  ✓ 复制 ${file}`);
            }
        });

        // 复制 public 目录到构建目录（pkg 需要）
        const publicSrc = path.join(this.projectRoot, 'public');
        const publicDest = path.join(this.buildDir, 'public');
        if (fs.existsSync(publicSrc)) {
            this.copyDirectory(publicSrc, publicDest);
            console.log('  ✓ 复制 public 目录（用于 pkg 打包）');
        }

        // 创建空的 uploads 目录（pkg 需要，但运行时不会使用）
        const uploadsDir = path.join(this.buildDir, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log('  ✓ 创建空的 uploads 目录（用于 pkg 打包）');
        }
    }

    // 递归复制目录
    copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // 创建 pkg 配置文件
    createPkgConfig() {
        console.log('⚙️ 创建 pkg 配置文件...');
        const pkgConfigPath = path.join(this.buildDir, 'package.json');
        
        // 读取原始 package.json
        const originalPackage = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
        
        // 创建专门用于 pkg 的配置
        const buildPackage = {
            name: 'LocalDrop',
            version: '1.0.0',
            description: '局域网内容分享平台',
            main: 'server.js',
            bin: 'server.js',  // 添加 bin 属性
            dependencies: originalPackage.dependencies,
            pkg: {
                targets: [
                    'node18-win-x64'
                ],
                outputPath: '.',  // 输出到当前目录
                assets: [
                    'public/**/*',
                    'public/index.html',
                    'public/script.js',
                    'public/style.css'
                ]
            }
        };

        fs.writeFileSync(pkgConfigPath, JSON.stringify(buildPackage, null, 2));
        console.log('  ✓ 创建 package.json 配置文件（含 bin 属性）');
    }

    // 安装依赖 (仅用于 pkg 打包，不保留 node_modules)
    installDependencies() {
        console.log('📦 安装依赖 (用于 pkg 打包)...');
        try {
            execSync('npm install --production', {
                cwd: this.buildDir,
                stdio: 'inherit'
            });
            console.log('  ✓ 依赖安装完成');
        } catch (error) {
            console.error('  ❌ 依赖安装失败:', error.message);
            throw error;
        }
    }

    // 执行 pkg 打包
    buildExecutable() {
        console.log('🔨 开始打包可执行文件...');
        try {
            // 检查是否安装了 pkg
            try {
                execSync('pkg --version', { stdio: 'pipe' });
            } catch (error) {
                console.log('📦 安装 pkg 工具...');
                execSync('npm install -g pkg', { stdio: 'inherit' });
            }

            // 执行打包 (仅 Windows)
            // 从构建目录执行，使用构建目录中的 package.json
            const pkgCommand = `pkg . --targets node18-win-x64`;
            execSync(pkgCommand, {
                cwd: this.buildDir, // 从构建目录执行
                stdio: 'inherit'
            });

            console.log('  ✓ 可执行文件打包完成');
            
            // 清理不必要的文件
            this.cleanupUnnecessaryFiles();
            
        } catch (error) {
            console.error('  ❌ 打包失败:', error.message);
            throw error;
        }
    }

    // 清理不必要的文件
    cleanupUnnecessaryFiles() {
        console.log('🧹 清理不必要的文件...');
        
        // 清理 node_modules 目录
        const nodeModulesPath = path.join(this.buildDir, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            fs.rmSync(nodeModulesPath, { recursive: true, force: true });
            console.log('  ✓ 删除 node_modules 目录');
        }
        
        // 清理 package.json (pkg 打包后不需要)
        const packageJsonPath = path.join(this.buildDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            fs.unlinkSync(packageJsonPath);
            console.log('  ✓ 删除 package.json');
        }
        
        // 清理 server.js (已打包到可执行文件中)
        const serverJsPath = path.join(this.buildDir, 'server.js');
        if (fs.existsSync(serverJsPath)) {
            fs.unlinkSync(serverJsPath);
            console.log('  ✓ 删除 server.js');
        }
        
        // 清理 public 目录 (已打包到可执行文件中)
        const publicDirPath = path.join(this.buildDir, 'public');
        if (fs.existsSync(publicDirPath)) {
            fs.rmSync(publicDirPath, { recursive: true, force: true });
            console.log('  ✓ 删除 public 目录');
        }
        
        // 清理 uploads 目录 (运行时会在 exe 目录中创建)
        const uploadsDirPath = path.join(this.buildDir, 'uploads');
        if (fs.existsSync(uploadsDirPath)) {
            fs.rmSync(uploadsDirPath, { recursive: true, force: true });
            console.log('  ✓ 删除 uploads 目录');
        }
        
        // 移动生成的 exe 文件到正确位置
        const exeFile = path.join(this.buildDir, 'LocalDrop.exe');
        if (fs.existsSync(exeFile)) {
            console.log('  ✓ 找到生成的 exe 文件');
        } else {
            console.log('  ⚠️  未找到生成的 exe 文件');
        }
        
        console.log('  ✓ 清理完成，只保留可执行文件');
    }

    // 创建启动脚本 (已集成到 exe 中，无需额外脚本)
    createStartScripts() {
        console.log('📝 启动提示已集成到 exe 文件中...');
        console.log('  ✓ 无需额外的启动脚本文件');
    }

    // 创建说明文件
    createReadme() {
        console.log('📄 创建说明文件...');
        
        const readmeContent = `# LocalDrop 可执行版本 (Windows)

## 功能说明
LocalDrop 是一个局域网内容分享平台，支持文本消息和文件上传分享。

## 使用方法

### 启动服务
1. 双击 \`LocalDrop.exe\` 启动服务
2. 程序会自动显示启动信息和访问地址
3. 等待2秒后服务自动启动

### 访问地址
- 本机访问: http://localhost:9999
- 局域网访问: http://[您的IP地址]:9999

## 功能特性
- 📝 文本消息分享
- 📁 文件上传下载 (最大50MB)
- 🌐 局域网内多设备访问
- 📱 响应式设计，支持移动端
- 🎨 美观的启动界面
- 📦 单文件分发，无需额外文件

## 注意事项
- 确保防火墙允许 9999 端口访问
- 文件存储在 exe 文件所在目录的 LocalDrop/uploads 文件夹中
- 服务重启后数据会清空（内存存储）
- 关闭程序窗口将停止服务
- 前端资源已打包到 exe 中，无需额外文件

## 技术信息
- 基于 Node.js 和 Express
- 使用 pkg 工具打包
- 支持 Windows x64
- 启动提示和前端资源已集成到可执行文件中

## 版本信息
版本: 1.0.0
构建时间: ${new Date().toLocaleString('zh-CN')}
平台: Windows x64
`;

        fs.writeFileSync(path.join(this.buildDir, 'README.txt'), readmeContent);
        console.log('  ✓ 说明文件创建完成');
    }

    // 显示构建结果
    showBuildResult() {
        console.log('\n🎉 构建完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📁 构建目录: ${this.buildDir}`);
        console.log('📦 生成的文件 (仅运行时必需):');
        
        const files = fs.readdirSync(this.buildDir);
        files.forEach(file => {
            const filePath = path.join(this.buildDir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
                const size = (stats.size / 1024 / 1024).toFixed(2);
                console.log(`  • ${file} (${size} MB)`);
            } else {
                console.log(`  • ${file}/ (目录)`);
            }
        });

        console.log('\n🚀 使用方法:');
        console.log('  直接双击: LocalDrop.exe');
        console.log('  程序会自动显示启动信息和访问地址');
        console.log('\n📖 详细说明请查看 README.txt');
    }

    // 主构建流程
    async build() {
        try {
            console.log('🚀 开始构建 LocalDrop 可执行文件...\n');
            console.log('📝 注意: 构建过程中会临时安装依赖用于 pkg 打包，完成后会自动清理\n');
            
            this.cleanBuildDir();
            this.copyFiles();
            this.createPkgConfig();
            this.installDependencies();
            this.buildExecutable();
            this.createStartScripts();
            this.createReadme();
            this.showBuildResult();
            
        } catch (error) {
            console.error('\n❌ 构建失败:', error.message);
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const builder = new BuildManager();
    builder.build();
}

module.exports = BuildManager;
