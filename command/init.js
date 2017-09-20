'use strict'

const downloadGitRepo = require('download-git-repo')
const fs = require('fs')
const path = require('path')
const exec = require('child_process').exec
const co = require('co')
const chalk = require('chalk')
const inquirer = require('inquirer')
const ora = require('ora')
const { renderString, renderTemplateFile } = require('template-file')
const glob = require('glob')
const copy = require('directory-copy')
const userHome = require('user-home');

// 下载资源
function download (repo, downloadName) {
  return new Promise((resolve, reject) => {
    let des = path.join(userHome, '.vide-templates', downloadName)
    // 先验证文件是否在有效期
    let info = null;
    try {
      info = fs.statSync(des)
      let lastModify = new Date().setTime(info.mtime)
      if (lastModify + 12 * 60 * 60 * 1000 > Date.now()) {
        resolve(true)
        return
      }
    } catch (e) {}
    // 如果没有，则进行新的下载
    let spinner = ora(`Downloading ${downloadName}`)
    spinner.start()
    downloadGitRepo(repo, des, function (error) {
      spinner.stop()
      resolve(error ? false : true)
    })
  })
}

// 替换模板
function replaceTemplate (pattern, data) {
  return new Promise((resolve, reject) => {
    glob(pattern, function (err, files) {
      let lists = files.map((item) => {
        return renderTemplateFile(item, data)
      })
      Promise.all(lists).then((rt) => {
        for (let i = 0; i < files.length; i++) {
          fs.writeFileSync(files[i], rt[i])
        }
        resolve(true)
      })
    })
  })
}

// 生成模板文件
function generateTemplate (type, name) {
  return new Promise((resolve, reject) => {
    let src = path.join(userHome, '.vide-templates', 'templates', type)
    let dest = path.join(process.cwd(), name)
    copy({src, dest}, function () {
      resolve(true)
    })
  })
}

module.exports = () => {
  co(function *() {
    let promptsExist = yield download('vide-template/prompts', 'prompts')
    if (!promptsExist) {
      console.log('Please check your network,tks!')
      return
    }
    let promptsObject = require(path.join(userHome,'.vide-templates','prompts/index.js'))
    // 提示输入
    let answers = yield inquirer.prompt(promptsObject.prompts)
    let type = answers['pluginType']
    let gitUrl = promptsObject.gitUrl[type]
    // 开始下载
    let templateExist = yield download(gitUrl, 'templates/' + type)
    if (!templateExist) {
      console.log('Please check your network,tks!')
      return
    }
    // 获取不同
    let resultData = yield inquirer.prompt(promptsObject.overwrite[type])
    // 生成模板文件在运行目录下面
    yield generateTemplate(type, resultData.name)
    // 增加额外数据和函数处理文件
    if (promptsObject.callback[type]) {
      promptsObject.callback[type](resultData)
    }
    // 替换文件
    try {
      yield replaceTemplate(path.join(process.cwd(), resultData.name, '**/*.*'), resultData)
      console.log('done')
    } catch (e) {
      console.log(e)
    }
    process.exit()
  })
}