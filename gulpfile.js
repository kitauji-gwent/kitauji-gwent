var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var fs = require("fs");
var babelify = require("babelify");
var livereload = require("gulp-livereload");
var sass = require("gulp-sass");
var handlebars = require("browserify-handlebars");
var gm = require("gulp-gm");
var argv = require("minimist")(process.argv.slice(2));
var version = require('gulp-version-number');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify');
var merge = require('merge-stream');
var path = require('path');
var cssConcat = require('gulp-concat-css');
var gulpIf = require('gulp-if');
var spriteSmithMulti = require('gulp.spritesmith-multi');
var gmsmith = require('gmsmith');
var sourcemaps = require('gulp-sourcemaps');

if(!argv.production) {
  livereload({start: true});
}

//fast install
//npm i --save-dev browserify vinyl-source-stream babelify gulp-livereload gulp gulp-sass
const versionConfig = {
  'value': '%MDS%',
  'append': {
    'key': 'v',
    'to': [
      {
        'type'  : 'js',
        'files': ['app.js', 'bgm.js', 'sound.js'] // Array [{String|Regex}] of explicit files to append to
      },
      {
        'type'  : 'css',
        'files': ['cards.css', 'main.css'] // Array [{String|Regex}] of explicit files to append to
      }
    ],
  },
};

const jpegSpriteImageQuality = 82; // GraphicsMagick's default value: 75

function browserifyTask() {
  return browserify('./client/js/main.js', {standalone: "app", debug: false}) // set false when publish
  .transform(handlebars).on("error", errorHandler)
  .transform(babelify)
  .bundle().on("error", errorHandler)
  .pipe(source('app.js').on("error", errorHandler))
  .pipe(buffer())
  .pipe(uglify())
  .on('error', errorHandler)
  .pipe(gulp.dest('./public/build/').on("error", errorHandler));

}

function sassTask() {
  return gulp.src('./client/scss/main.scss')
  .pipe(sourcemaps.init())
  .pipe(sass({
    outputStyle: 'compressed'
  }).on("error", errorHandler))
  .pipe(sourcemaps.write())
  .pipe(gulp.dest('./public/build/').on("error", errorHandler))
  .pipe(livereload().on("error", errorHandler));
}

function unitTestsTask() {
  return browserify('./test/src/mainSpec.js', {standalone: "app", debug: true})
  .transform(babelify)
  .bundle().on("error", errorHandler)
  .pipe(source('spec.js').on("error", errorHandler))
  .pipe(gulp.dest('./test/spec/').on("error", errorHandler));
}

function watchTask(done) {
  if(argv.production) return done();
  gulp.watch("./assets/data/*", gulp.series(browserifyTask));
  gulp.watch("./client/js/**", gulp.series(browserifyTask));
  gulp.watch("./client/templates/**", gulp.series(browserifyTask));
  gulp.watch("./client/scss/*", gulp.series(sassTask));
  gulp.watch("./client/*.html", gulp.series(indexTask));
  gulp.watch("./client/css/*.css", gulp.series(indexTask));
  gulp.watch("./client/json/**", gulp.parallel(indexTask, browserifyTask));
  gulp.watch("./test/src/*", gulp.series(unitTestsTask));
}


function indexTask() {
  var indexHtmlStream = gulp.src("./client/index.html")
  .pipe(version(versionConfig))
  .pipe(gulp.dest("./public/"));

  var jsonStream = gulp.src("./client/json/**")
  .pipe(gulp.dest("./public/json/"));

  return merge(indexHtmlStream, jsonStream);
}

function resizeAndConvertFormatTask(done) {
  if(fs.existsSync(__dirname + "/assets/cards/md/kitauji/oumae_kumiko.jpg")) {
    console.log("skip image resizing and format conversion");
    return done();
  }
  return gulp.src('./assets/original_cards/**/*.png')
  .pipe(gm(function(gmfile) {
    return gmfile.resize(null, 450)
        .setFormat('jpg')
        .quality(100);
  }))
  .pipe(gulp.dest('./assets/cards/lg/'))
  .pipe(gm(function(gmfile) {
    return gmfile.resize(null, 284)
        .setFormat('jpg')
        .quality(100);
  }))
  .pipe(gulp.dest('./assets/cards/md/'));
}

function cardSpritesGenerationTask(done) {
  if(fs.existsSync(__dirname + "/public/build/cards.css")) {
    console.log("skip card sprites generation");
    return done();
  }

  return getSpriteStreamFromPngFiles(
    "./assets/cards/",
    "cards.css",
    "cards",
    "card",
    "jpg",
    true
  )
  .pipe(gulp.dest("./public/build/"));
}

function abilitySpritesGenerationTask(done) {
  if(fs.existsSync(__dirname + "/public/build/_ability.scss")) {
    console.log("skip ability sprites generation");
    return done();
  }

  return getSpriteStreamFromPngFiles(
    "./assets/texture/ability/",
    "_ability.scss",
    "abilities",
    "ability",
    "png",
    false
  )
  .pipe(gulp.dest("./public/build/"));
}


var sassTaskDelegate = gulp.series(abilitySpritesGenerationTask, sassTask);
var cardSpritesGenerationTaskDelegate = gulp.series(resizeAndConvertFormatTask, cardSpritesGenerationTask);

exports.browserify = browserifyTask;
exports.watch = watchTask;
exports.sass = sassTaskDelegate;
exports.unitTests = unitTestsTask;
exports.index = indexTask;
exports.resizeAndConvertFormat = resizeAndConvertFormatTask;
exports.cardSpritesGeneration = cardSpritesGenerationTaskDelegate;
exports.abilitySpritesGeneration = abilitySpritesGenerationTask;

exports.default = gulp.parallel(
  watchTask,
  browserifyTask,
  sassTaskDelegate,
  unitTestsTask,
  indexTask,
  cardSpritesGenerationTaskDelegate
);

function errorHandler (errorMessage) {
  throw new Error(errorMessage);
}

// Learned from
//   https://github.com/gulpjs/gulp/blob/master/docs/recipes/running-task-steps-per-folder.md
//   https://github.com/google/material-design-icons/pull/757/files?file-filters%5B%5D=.js#diff-ba210a9157252cc983268fdc3aa3ed52
//
function getFolders (dirPath) {
  return fs.readdirSync(dirPath)
    .filter(function (file) {
      return fs.statSync(path.join(dirPath, file)).isDirectory();
    });
}

function getSpriteStreamFromPngFiles (
  inputImageDirPath,
  outputStyleFileName,
  outputImagefileNamePrefix,
  cssPrefix,
  outputImagefileFormat,
  generateSplitSprites
) {
  var folders = getFolders(inputImageDirPath);
  if (folders.length === 0) {
    errorHandler(`No subdirectory in "${inputImageDirPath}".`);
  }

  var tasks = folders.map(function (folder) {
    var filesGlobPath = path.join(inputImageDirPath, folder, "/**/*.{png,jpg}"); // Attention!
    console.log("source glob path: " + filesGlobPath);

    var imageFileNamePrefix = outputImagefileNamePrefix;
    if (generateSplitSprites) {
      imageFileNamePrefix = `${outputImagefileNamePrefix}-${folder}`;
    }
    console.log("imageFileNamePrefix: " + imageFileNamePrefix);

    var cssSpritesheetName = cssPrefix;
    if (generateSplitSprites) {
      cssSpritesheetName = `${cssPrefix}-${folder}`;
    }
    console.log("cssSpritesheetName: " + cssSpritesheetName);
    
    return gulp.src(filesGlobPath, { read: false /* `gmsmith` doesn't support in-memory content */ })
    .pipe(spriteSmithMulti({
      spritesmith: function (options, sprite, icons) {
        options.imgName = `${imageFileNamePrefix}-${sprite}.${outputImagefileFormat}`;
        // Don't care about 'cssName', these css files will be concatenated with each other.
        options.imgPath = `../../public/build/${options.imgName}`;
        options.cssSpritesheetName = `${cssSpritesheetName}-${sprite}`;

        options.engine = gmsmith;
        options.imgOpts = {
          quality: jpegSpriteImageQuality
        };
      }
    }));
  });

  return merge(tasks).pipe(gulpIf("*.css", cssConcat(
    outputStyleFileName
  )));
}
