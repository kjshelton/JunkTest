var express = require('express'),
        app = express(),
       http = require('http'),
     server = http.createServer(app),
         io = require('socket.io').listen(server);
     bbbPWM1 = require("bbb-pwm"),
     bbbPWM2 = require("bbb-pwm2"),
     bbbI2C = require("bbb-i2c"),
          b = require('bonescript');

console.log("Initializing Interfaces");

var PanPwm = new bbbPWM1('/sys/devices/ocp.2/pwm_test_P8_13.10/', 20000000);
var TiltPwm = new bbbPWM2('/sys/devices/ocp.2/pwm_test_P9_14.11/', 20000000);
var dac = new bbbI2C('/dev/i2c-1');
var JAZZYPOWER = "P9_12";
var SPEED = "P9_27";
var CenterValue = 1100;
var heartbeatCount = 0;
var ConnectionValid=0;

console.log("Starting Server");

// Public files
app.use(express.static(__dirname + '/public'));

server.listen(8000);

// routing
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

b.pinMode(JAZZYPOWER, b.OUTPUT);  // configure pin for Jazzy power control
b.pinMode(SPEED, b.OUTPUT);       // configure pin for Jazzy speed control
b.digitalWrite(JAZZYPOWER,b.LOW); // initialize pin low
b.digitalWrite(SPEED, b.LOW);     // initialize pin low

dac.SetValue(1, 2.5);           // Stop Driving
dac.SetValue(2, 2.5);           // Stop Turning

// Socket.io logic
io.sockets.on('connection', function (socket) {
    console.log('Connection established. ');
    ConnectionValid++;
    console.log(" Connections=",ConnectionValid);
    io.sockets.emit('status','WebSocket Server Connected!');
    // when the client emits 'updateXxxxx', this listens and executes
    socket.on('updateMotion', function (data) {
        io.sockets.emit('status','Motion');
         motionControl(data);
        //console.log(data);
    });
    socket.on('updateServo', function (data) {
        io.sockets.emit('status','Servo Control');
        servoControl(data);
        //console.log(data);
    });
    
    setInterval(function(){
              heartbeatCount++;
              if (heartbeatCount > 30 && ConnectionValid==1)  {
                console.log("Heartbeat Timeout. Stopping. Count=", heartbeatCount);
                    console.log(" Connections=",ConnectionValid);
                dac.SetValue(1, 2.5);           // Stop Driving
                dac.SetValue(2, 2.5);           // Stop Turning
                heartbeatCount=0;
              }
        }, 100); // 100ms a second interval

    socket.on('panUpdate', function (data) {  // pan slider update
        PanPwm.setDuty(data);
        console.log('Pan Slider: ' + data);
        io.sockets.emit('status', 'Pan Slider Changed');
    });

    socket.on('tiltUpdate', function (data) {  // tilt slider update
        TiltPwm.setDuty(data);
        console.log('Tilt Slider: ' + data);
        io.sockets.emit('status', 'Tilt Slider Changed');
    });

    socket.on('powerSwitch', function (data) {  // toggle jazzy power switch
        console.log('Power Switch');
        io.sockets.emit('status', 'Power Switch Toggled');
        b.digitalWrite(JAZZYPOWER, b.HIGH); // pulse high for 100ms
        setTimeout(function () {
            b.digitalWrite(JAZZYPOWER, b.LOW);
        }, 100);
    });

    socket.on('speedButton', function (data) { // increment speed {wraps around - 1,2,3,4,5,1}
        console.log('Speed Button'); 
        io.sockets.emit('status', 'Speed ++');
        b.digitalWrite(SPEED, b.HIGH);  // pulse high for 100ms
        setTimeout(function () {
            b.digitalWrite(SPEED, b.LOW);
        }, 100);
    });

    socket.on('shutdownButton', function (data) {
        console.log('Shutdown Button');
        io.sockets.emit('status', 'Beagle Bone Linux Shutting Down');
        var exec = require('child_process').exec;
        exec('/sbin/shutdown -h now', function (error, stdout, stderr) {
            // output is in stdout
            console.log('stdout: ' + stdout);
        });
    });

    socket.on('heartbeat', function (data) {
        //console.log('heartbeat, count=', heartbeatCount);
        heartbeatCount = 0;
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        console.log('Connection Disconnected. Stopping Jazzy');
        ConnectionValid--;
        console.log("Now connections=",ConnectionValid);

        dac.SetValue(1, 2.5);  // Stop Driving
        dac.SetValue(2, 2.5);  // Stop Turning
    });
});



function motionControl(d){
  //console.log(d);
  // Stop
  if (d.dyr == 0 && d.dxr == 0) {
    //console.log("Stop");
    io.sockets.emit('status','Stop');
 
    dac.SetValue(1, 2.5);
    dac.SetValue(2, 2.5);
  }
  // Forward or backwards
  else {
    dac.SetValue(1,-d.dyr/100.0 + 2.5);  // set fwd/rev value scaled and centered at 2.5v
    dac.SetValue(2,d.dxr/100.0 + 2.5);  // set left/right value scaled and centered at 2.5v
    if (d.dyr > 0) {
      //console.log("Rev");
    }
    else {
      //console.log("Fwd");
    }
  
    if (d.dxr > 0) {
      // Right
      //console.log("     Right");
    }
    else {
      // Left
      //console.log("     Left");
    }
  }
}

function servoControl(d){
  //console.log(d);
  if (d.dxl == 0) {
    PanPwm.setDuty(CenterValue);
    //console.log("             Pan Center");
    io.sockets.emit('status','Servos Centered');
  }
  else {
    PanPwm.setDuty(d.dxl*5 + CenterValue);
  }

  if (d.dyl == 0) {
    TiltPwm.setDuty(CenterValue);
    //console.log("             Pan Center");
  }
  else {
    TiltPwm.setDuty(-d.dyl*5 + CenterValue);

  }

}


