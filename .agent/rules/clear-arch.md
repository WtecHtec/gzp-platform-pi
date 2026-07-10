
# 前端整洁架构 Skill

## 核心分层

```
┌─────────────────────────────┐  ← 最易变，强依赖框架
│            UI               │  组件、页面、样式
├─────────────────────────────┤
│       Hook                  │  组合层：调 Use Case + 消费 ViewModel
├─────────────────────────────┤
│       View Model            │  UI 展示逻辑：格式化、文案、颜色
├─────────────────────────────┤
│       Use Case              │  异步流程：调接口、聚合数据、错误处理
├─────────────────────────────┤
│       Domain                │  ← 最稳定，零框架、零 IO
│  实体 · 业务规则              │
├─────────────────────────────┤
│    Utils                    │ （纯函数，不依赖任何层）
└─────────────────────────────┘
```

**依赖规则**：外层可以导入内层，内层绝不导入外层。

---

## 各层职责与边界

### Domain（领域层）

**职责**：纯业务规则。入参和出参都是内存中的对象，不涉及任何 IO。

**边界判断**：Domain 里永远不出现 `async`、`fetch`、`repo`。只要出现了 `await`，就说明职责越界。

```ts
// domain/entities/order.ts
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
  totalCents: number;
}

// domain/rules/orderRules.ts
// 纯函数：入参是已拿到的数据，出参是判断结果
export const canCancelOrder = (order: Order): boolean =>
  order.status === 'pending';

export const calcDiscount = (order: Order, user: User): number =>
  user.isVip ? order.totalCents * 0.9 : order.totalCents;
```

**变化触发点**：产品说"审核状态流转规则改了"、"VIP 折扣逻辑变了"——改 Domain。

---

### Use Case（用例层）

**职责**：处理所有异步流程——调接口、聚合多个数据源、错误处理、权限校验。返回干净的 Domain 数据，不做任何 UI 相关的转换。

**边界判断**：Use Case 返回值里不应出现 `statusLabel`、`formattedTotal`、颜色值等展示字段。一旦出现，说明越界到 ViewModel 了。

```ts
// use-cases/getOrderDetail.ts
export const getOrderDetail = async (
  id: string,
  repo: IOrderRepository,
): Promise<Order> => {
  const order = await repo.findById(id);
  if (!order) throw new NotFoundError('订单不存在');
  return order;  // 返回 Domain 数据，不管 UI 怎么展示
};

// 需要聚合多个接口时，做的是业务数据组合，不是 UI 转换
export const getOrderWithUser = async (
  id: string,
  orderRepo: IOrderRepository,
  userRepo: IUserRepository,
): Promise<{ order: Order; user: User }> => {
  const order = await orderRepo.findById(id);
  const user = await userRepo.findById(order.userId);
  return { order, user };  // 还是 Domain 数据，只是组合了
};

// use-cases/cancelOrder.ts
export const cancelOrder = async (
  id: string,
  repo: IOrderRepository,
): Promise<void> => {
  const order = await repo.findById(id);
  if (!canCancelOrder(order)) throw new DomainError('该订单不可取消');
  await repo.save({ ...order, status: 'cancelled' });
};
```

**变化触发点**：后端接口拆分或合并、新增权限校验、多接口聚合逻辑变化——改 Use Case。

---

### View Model（视图模型层）

**职责**：把 Domain 数据转换成 UI 需要的展示结构。纯函数，无副作用，可独立单测。

**关键洞察**：View Model 复用 Domain 规则，但面向的是展示需求。`canCancelOrder` 是业务规则（Domain），`statusLabel: '待支付'` 是展示需求（ViewModel）——两者方向不同。

```ts
// view-models/orderViewModel.ts
export interface OrderViewModel {
  id: string;
  statusLabel: string;      // '待支付' 而非 'pending'
  statusColor: string;      // '#F59E0B'
  formattedTotal: string;   // '¥ 299.00'
  canCancel: boolean;       // 复用 domain 规则的结果
  itemCount: string;        // '共 3 件'
}

export const toOrderViewModel = (order: Order): OrderViewModel => ({
  id: order.id,
  statusLabel: ORDER_STATUS_LABELS[order.status],
  statusColor: ORDER_STATUS_COLORS[order.status],
  formattedTotal: formatCurrency(order.totalCents),
  canCancel: canCancelOrder(order),   // ← 复用 domain 规则，不重复写
  itemCount: `共 ${order.items.length} 件`,
});
```

**变化触发点**：产品说"这个页面的状态文案改一下"、"金额显示格式变了"——改 ViewModel。

**何时提取 ViewModel**（不是每个 hook 都需要）：
- 映射字段超过 3-4 个
- 有条件判断逻辑（`status === 'pending'` 这类）
- 同一份数据在多个页面复用
- 你想单独验证"这个映射逻辑对不对"，但不想跑完整组件

---

### Hook（组合层）

**职责**：Hook 是 ViewModel 的运行容器，同时也是 Use Case 的触发入口。读的方向走 ViewModel，写的方向走 Use Case。

```
用户操作 → hook → Use Case（写）
                → ViewModel（读）← Domain
```

```ts
// hooks/useOrder.ts
export const useOrder = (id: string) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrderDetail(id, orderRepo)   // ← 调 Use Case，不直接调 repo
      .then(setOrder)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const cancel = () => cancelOrder(id, orderRepo);  // ← 写操作走 Use Case

  return {
    vm: order ? toOrderViewModel(order) : null,  // ← 读操作走 ViewModel
    loading,
    error,
    cancel,
  };
};
```

**关于 hook 是否可以直接调 repo**：严格边界下 hook 只调 Use Case。但如果查询逻辑真的没有任何附加流程（无错误处理、无权限校验、无聚合），可以酌情省略 Use Case 这一层，直接调 repo。有流程就包，没有不必强求。

---

### UI（展示层）

**职责**：纯展示。消费 ViewModel，永远不接触原始 Domain 数据，不写业务规则，不做格式化。

```tsx
// ui/components/OrderCard.tsx —— 无状态，只接收 vm
const OrderCard = ({ vm, onCancel }: {
  vm: OrderViewModel;
  onCancel: () => void;
}) => (
  <div>
    <span style={{ color: vm.statusColor }}>{vm.statusLabel}</span>
    <span>{vm.formattedTotal}</span>
    <span>{vm.itemCount}</span>
    {vm.canCancel && <button onClick={onCancel}>取消订单</button>}
  </div>
);

// ui/pages/OrderPage.tsx —— 调 hook，向下传 vm
const OrderPage = ({ id }: { id: string }) => {
  const { vm, loading, error, cancel } = useOrder(id);
  if (loading) return <Spinner />;
  if (error || !vm) return <ErrorView />;
  return <OrderCard vm={vm} onCancel={cancel} />;
};
```

---

### Utils（工具层）

**职责**：纯函数，零层依赖，可跨项目复用。

```ts
// utils/currency.ts
export const formatCurrency = (cents: number, currency = 'CNY'): string =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency })
    .format(cents / 100);
```

---

## 边界速查

| 问题 | 该改哪层 |
|---|---|
| 审核状态流转规则变了 | Domain |
| 后端接口拆成两个 | Use Case |
| 订单状态文案改成中文 | ViewModel |
| 金额显示格式变了 | ViewModel |
| 组件里要展示新字段 | ViewModel + UI |
| 新增取消前需要二次确认 | Use Case + Hook |

---

## 反模式识别

| 反模式 | 信号 | 修复 |
|---|---|---|
| 业务规则在 JSX | `order.status === 'pending' && <button>` | 移到 Domain，通过 `vm.canCancel` 暴露 |
| 格式化在组件 | `(price / 100).toFixed(2)` 在 JSX | 移到 ViewModel 或 Utils |
| Use Case 返回展示字段 | 返回值含 `statusLabel`、颜色值 | 这是 ViewModel 的事，Use Case 只返回 Domain 数据 |
| Domain 有 async | `async findById` 出现在实体或规则文件 | IO 全部移到 Use Case |
| Hook 内联映射逻辑 | `useEffect` 回调里直接拼 `statusLabel` | 提取为 `toXxxViewModel` 纯函数 |

---

## 测试策略

每层独立测试，互不依赖：

```ts
// Domain —— 纯函数，零 mock
it('pending 订单可以取消', () => {
  expect(canCancelOrder({ status: 'pending', ...rest })).toBe(true);
  expect(canCancelOrder({ status: 'paid', ...rest })).toBe(false);
});

// ViewModel —— 纯函数，零 mock
it('正确格式化金额和状态', () => {
  const vm = toOrderViewModel({ status: 'pending', totalCents: 29900, ...rest });
  expect(vm.formattedTotal).toBe('¥299.00');
  expect(vm.canCancel).toBe(true);
  expect(vm.statusLabel).toBe('待支付');
});

// Use Case —— 内存 repo 替换真实接口，无需 mock 库
class InMemoryOrderRepo implements IOrderRepository {
  private store = new Map<string, Order>();
  async findById(id: string) { return this.store.get(id)!; }
  async save(order: Order) { this.store.set(order.id, order); }
}

it('取消 pending 订单', async () => {
  const repo = new InMemoryOrderRepo();
  await repo.save({ id: '1', status: 'pending', ...rest });
  await cancelOrder('1', repo);
  expect((await repo.findById('1')).status).toBe('cancelled');
});

// UI —— 传入 mock vm，只测渲染行为
it('canCancel 为 true 时显示取消按钮', () => {
  const vm = { canCancel: true, statusLabel: '待支付', ...rest };
  render(<OrderCard vm={vm} onCancel={jest.fn()} />);
  expect(screen.getByText('取消订单')).toBeInTheDocument();
});
```

---

## 目录结构

```
src/
├── domain/
│   ├── entities/         # 业务实体类型
│   ├── rules/            # 纯函数业务规则
│   └── repositories/     # 仓储接口（只有 interface，无实现）
├── use-cases/            # 异步流程编排
├── view-models/          # toXxxViewModel 纯函数
├── hooks/                # 组合层：Use Case + ViewModel
├── ui/
│   ├── components/       # 无状态展示组件
│   └── pages/            # 调 hook，向下传 vm
├── infrastructure/
│   └── repositories/     # IRepository 的真实实现（fetch/axios）
└── utils/                # 格式化、校验等纯工具函数
```

---

## 分层价值

分层的本质是**把"容易变的"和"不容易变的"隔离开**：

- Domain 变得最慢（业务规则稳定）
- Use Case 跟着接口走（后端变则变）
- ViewModel 跟着 UI 需求走（产品改稿则变）
- 每种变化只影响它该影响的层，不会扩散
