import init, { Client, version } from "./pkg/horizon_web.js";

const canvas = document.querySelector("#horizon-canvas");
const status = document.querySelector("#status");

const shader = `
struct Uniforms {
  view_proj: mat4x4<f32>,
  time: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexIn {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
};
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var output: VertexOut;
  output.position = uniforms.view_proj * vec4<f32>(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;

function matrixPerspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ]);
}

function matrixView() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, -2.2, -8, 1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function cube(x, y, z, color) {
  const vertices = [];
  const faces = [
    [[0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]],
    [[0, 0, -1], [[1, 0], [0, 0], [0, 1], [1, 1]]],
    [[1, 0, 0], [[1, 0], [1, 1], [0, 1], [0, 0]]],
    [[-1, 0, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]],
    [[0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]],
    [[0, -1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]],
  ];
  const corners = [
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5],
    [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5],
  ];
  const indices = [
    [4, 5, 6, 4, 6, 7], [1, 0, 3, 1, 3, 2],
    [5, 1, 2, 5, 2, 6], [0, 4, 7, 0, 7, 3],
    [3, 7, 6, 3, 6, 2], [0, 1, 5, 0, 5, 4],
  ];
  for (let face = 0; face < 6; face++) {
    for (const index of indices[face]) {
      const point = corners[index];
      vertices.push(point[0] + x, point[1] + y, point[2] + z, ...color);
    }
  }
  return vertices;
}

async function main() {
  await init();
  const client = new Client(1234n);
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter is not available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const width = 11;
  const depth = 7;
  const terrain = client.terrain_heights(width, depth);
  const vertices = [];
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const height = terrain[z * width + x];
      const worldX = x - Math.floor(width / 2);
      const worldZ = z - Math.floor(depth / 2);
      vertices.push(...cube(worldX, height / 2, worldZ, [0.18 + height, 0.55, 0.28]));
    }
  }
  const vertexBuffer = device.createBuffer({
    size: vertices.length * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, new Float32Array(vertices));
  const uniformBuffer = device.createBuffer({
    size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module, entryPoint: "vs_main",
      buffers: [{ arrayStride: 24, attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x3" },
      ] }],
    },
    fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "back" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  function resize() {
    const ratio = Math.min(device.limits.maxTextureDimension2D / 1024, devicePixelRatio);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  }
  addEventListener("resize", resize);
  resize();
  status.textContent = `${version()} · offline · single-threaded · seed ${client.world_seed()}`;

  function frame(time) {
    client.tick();
    const projection = matrixPerspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 100);
    const viewProjection = multiply(projection, matrixView());
    const uniforms = new Float32Array(20);
    uniforms.set(viewProjection);
    uniforms[16] = time / 1000;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.03, g: 0.08, b: 0.12, a: 1 },
        loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 6);
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error) => {
  status.textContent = `Horizon Web failed: ${error.message}`;
  console.error(error);
});
