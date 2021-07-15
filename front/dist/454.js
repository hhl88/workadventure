(self.webpackChunkworkadventurefront=self.webpackChunkworkadventurefront||[]).push([[454],{2454:(e,t,a)=>{"use strict";a.r(t),a.d(t,{default:()=>p});var n=a(2260),r=a(2260);class i extends r.Renderer.WebGL.Pipelines.MultiPipeline{constructor(e){super({game:e,fragShader:"\n        precision mediump float;\n\n        uniform sampler2D uMainSampler;\n        uniform vec2 uTextureSize;\n\n        varying vec2 outTexCoord;\n        varying float outTintEffect;\n        varying vec4 outTint;\n\n        void main(void) \n        {\n          vec4 texture = texture2D(uMainSampler, outTexCoord);\n          vec4 texel = vec4(outTint.rgb * outTint.a, outTint.a);\n          vec4 color = texture;\n\n          if (outTintEffect == 0.0)\n          {\n            color = texture * texel;\n          }\n          else if (outTintEffect == 1.0)\n          {\n            color.rgb = mix(texture.rgb, outTint.rgb * outTint.a, texture.a);\n            color.a = texture.a * texel.a;\n          }\n          else if (outTintEffect == 2.0)\n          {\n            color = texel;\n          }\n\n          vec2 onePixel = vec2(1.0, 1.0) / uTextureSize;\n          float upAlpha = texture2D(uMainSampler, outTexCoord + vec2(0.0, onePixel.y)).a;\n          float leftAlpha = texture2D(uMainSampler, outTexCoord + vec2(-onePixel.x, 0.0)).a;\n          float downAlpha = texture2D(uMainSampler, outTexCoord + vec2(0.0, -onePixel.y)).a;\n          float rightAlpha = texture2D(uMainSampler, outTexCoord + vec2(onePixel.x, 0.0)).a;\n\n          if (texture.a == 0.0 && max(max(upAlpha, downAlpha), max(leftAlpha, rightAlpha)) == 1.0) \n          {\n            color = vec4(1.0, 1.0, 0.0, 1.0);\n          }\n\n          gl_FragColor = color;\n        }\n      "})}}i.KEY="Outline";class o{constructor(e,t,a,n,r){this.id=e,this.sprite=t,this.eventHandler=a,this.activationRadius=n,this.onActivateCallback=r,this.isSelectable=!1,this.callbacks=new Map,this.activationRadiusSquared=n*n}getId(){return this.id}actionableDistance(e,t){const a=(e-this.sprite.x)*(e-this.sprite.x)+(t-this.sprite.y)*(t-this.sprite.y);return a<this.activationRadiusSquared?a:null}selectable(){this.isSelectable||(this.isSelectable=!0,this.sprite.pipeline)}notSelectable(){this.isSelectable&&(this.isSelectable=!1)}activate(){this.onActivateCallback(this)}emit(e,t,a=null){this.eventHandler.emitActionableEvent(this.id,e,t,a),this.fire(e,t,a)}on(e,t){let a=this.callbacks.get(e);void 0===a&&(a=new Array,this.callbacks.set(e,a)),a.push(t)}fire(e,t,a){const n=this.callbacks.get(e);if(void 0!==n)for(const e of n)e(t,a)}}var s=a(7071),c=n.GameObjects.Sprite;const l=(new s.IsInterface).withProperties({status:s.isString}).get();let u={status:"off"};const p={preload:e=>{e.atlas("computer","/resources/items/computer/computer.png","/resources/items/computer/computer_atlas.json")},create:e=>{e.anims.create({key:"computer_off",frames:[{key:"computer",frame:"computer_off"}],frameRate:10,repeat:-1}),e.anims.create({key:"computer_run",frames:[{key:"computer",frame:"computer_on1"},{key:"computer",frame:"computer_on2"}],frameRate:5,repeat:-1})},factory:(e,t,a)=>{if(void 0!==a){if(!l(a))throw new Error("Invalid state received for computer object");u=a}const n=new c(e,t.x,t.y,"computer");e.add.existing(n),"on"===u.status&&n.anims.play("computer_run");const r=new o(t.id,n,e,32,(e=>{"off"===u.status?(u.status="on",e.emit("TURN_ON",u)):(u.status="off",e.emit("TURN_OFF",u))}));return r.on("TURN_ON",(()=>{n.anims.play("computer_run")})),r.on("TURN_OFF",(()=>{n.anims.play("computer_off")})),r}}}}]);
//# sourceMappingURL=454.js.map