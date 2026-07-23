import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useForm,
  type FieldValues,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form';
import type { ZodType } from 'zod';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/feedback/toast-provider';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ImagePreview } from '@/components/ui/image-preview';
import { apiErrorMessage } from '@/lib/api-error';
import type { MasterRow, ProductImage } from './api';
import type { FormField, MasterConfig } from './config';
import {
  useMasterOptions,
  useProductImageMutations,
  useProductImages,
  useProductImageUrl,
} from './use-master-data';

function rowDefaults(config: MasterConfig, row?: MasterRow): Record<string, unknown> {
  return Object.fromEntries(
    config.fields.map((field) => {
      if (!row) {
        if (field.type === 'multiselect') return [field.name, []];
        if (field.type === 'json' || field.type === 'attributes') return [field.name, '{}'];
        if (field.name === 'decimalScale') return [field.name, 0];
        return [field.name, ''];
      }
      if (field.type === 'json' || field.type === 'attributes')
        return [field.name, JSON.stringify(row[field.name] ?? {}, null, 2)];
      return [field.name, row[field.name] ?? ''];
    }),
  );
}

type AttributePair = { key: string; value: string };

const inventoryModeGuides = [
  {
    value: 'DIRECT_FROM_LOCATION',
    title: '指定仓库直发',
    summary: '货在本地实际仓，由本地仓直接发给客户或平台订单。',
    when: '适合线下销售、自发货，或商品尚未送入平台仓。',
    rule: '出库扣减渠道默认地点或订单指定的真实仓库库存。',
  },
  {
    value: 'EXTERNAL_WAREHOUSE',
    title: '外部平台仓',
    summary: '货已实际进入平台、海外仓或第三方仓，平台仓有独立真实库存。',
    when: '适合已把商品调拨到销售平台仓的渠道。',
    rule: '先调拨入关联的平台仓，销售只能从该平台仓扣减库存。',
  },
  {
    value: 'VIRTUAL_ALLOCATION',
    title: '虚拟渠道额度',
    summary: '货仍在本地实际仓，只为渠道设定可销售上限，不建立渠道实体库存。',
    when: '适合多渠道共用本地库存，但需要限制某渠道可售数量。',
    rule: '销售仍扣减实际仓库存，同时消耗该渠道的已分配额度。',
  },
] as const;

function InventoryModeGuide({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <section aria-label="库存模式选择说明" className="inventory-mode-guide">
      <header>
        <strong>如何选择库存模式</strong>
        <span>先判断货物实际存放位置，再选择是否需要渠道额度限制。</span>
      </header>
      <div>
        {inventoryModeGuides.map((guide) => (
          <button
            aria-pressed={value === guide.value}
            key={guide.value}
            onClick={() => onSelect(guide.value)}
            type="button"
          >
            <h3>{guide.title}</h3>
            <p>{guide.summary}</p>
            <dl>
              <div>
                <dt>选择场景</dt>
                <dd>{guide.when}</dd>
              </div>
              <div>
                <dt>库存规则</dt>
                <dd>{guide.rule}</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
    </section>
  );
}

function attributePairs(value: unknown): AttributePair[] {
  try {
    const attributes = JSON.parse(String(value ?? '{}'));
    if (attributes && typeof attributes === 'object' && !Array.isArray(attributes))
      return Object.entries(attributes).map(([key, attributeValue]) => ({
        key,
        value: String(attributeValue),
      }));
  } catch {
    // The schema reports invalid legacy data; keep the editor usable.
  }
  return [];
}

function AttributeEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: string) => void;
}) {
  const [pairs, setPairs] = useState<AttributePair[]>(() => attributePairs(value));

  useEffect(() => setPairs(attributePairs(value)), [value]);

  const update = (next: AttributePair[]) => {
    setPairs(next);
    onChange(
      JSON.stringify(
        Object.fromEntries(
          next.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value]),
        ),
      ),
    );
  };

  const rows = pairs.length ? pairs : [{ key: '', value: '' }];

  return (
    <div className="attribute-editor">
      {rows.map((pair, index) => (
        <div className="attribute-editor-row" key={index}>
          <Input
            aria-label={`属性名 ${index + 1}`}
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, key: event.target.value } : item,
                ),
              )
            }
            placeholder="属性名，例如：颜色"
            value={pair.key}
          />
          <Input
            aria-label={`属性值 ${index + 1}`}
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, value: event.target.value } : item,
                ),
              )
            }
            placeholder="属性值，例如：黑色"
            value={pair.value}
          />
          <button
            aria-label={`删除属性 ${index + 1}`}
            className="icon-button attribute-editor-remove"
            onClick={() => update(rows.filter((_, itemIndex) => itemIndex !== index))}
            type="button"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        className="button button-ghost attribute-editor-add"
        onClick={() => update([...rows, { key: '', value: '' }])}
        type="button"
      >
        <Plus size={16} />
        添加属性
      </button>
    </div>
  );
}

function ProductImageCard({
  image,
  onRemove,
  pending,
  productId,
}: {
  image: ProductImage;
  onRemove: () => void;
  pending: boolean;
  productId: string;
}) {
  const content = useProductImageUrl(productId, image.fileAssetId);
  return (
    <article className={`product-image-card ${image.isPrimary ? 'primary' : ''}`}>
      <div className="product-image-preview">
        {content.url ? (
          <ImagePreview alt={image.fileAsset.fileName} src={content.url} />
        ) : content.isLoading ? (
          <span aria-label="图片加载中" className="image-loading-spinner" />
        ) : (
          <ImagePlus size={22} />
        )}
      </div>
      <div className="product-image-meta">
        <strong title={image.fileAsset.fileName}>{image.fileAsset.fileName}</strong>
        <span>{image.isPrimary ? '主图' : '附图'}</span>
      </div>
      <footer>
        <button className="danger" disabled={pending} onClick={onRemove} type="button">
          <Trash2 size={13} /> 删除
        </button>
      </footer>
    </article>
  );
}

function PendingProductImageCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return (
    <article className="product-image-card pending">
      <div className="product-image-preview">
        {url ? <ImagePreview alt={file.name} src={url} /> : <ImagePlus size={22} />}
      </div>
      <div className="product-image-meta">
        <strong title={file.name}>{file.name}</strong>
        <span>待上传</span>
      </div>
      <footer>
        <button className="danger" onClick={onRemove} type="button">
          <Trash2 size={13} /> 移除
        </button>
      </footer>
    </article>
  );
}

function DynamicField({
  field,
  register,
  setValue,
  watch,
  error,
}: {
  field: FormField;
  register: ReturnType<typeof useForm<FieldValues>>['register'];
  setValue: UseFormSetValue<FieldValues>;
  watch: UseFormWatch<FieldValues>;
  error?: string;
}) {
  const options = useMasterOptions(field.optionResource);
  const choices =
    field.options ??
    options.data?.data.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })) ??
    [];
  const registration = register(field.name);

  return (
    <Field error={error} label={field.label}>
      {field.type === 'attributes' ? (
        <AttributeEditor
          onChange={(value) =>
            setValue(field.name, value, { shouldDirty: true, shouldValidate: true })
          }
          value={watch(field.name)}
        />
      ) : field.type === 'textarea' || field.type === 'json' ? (
        <Textarea
          placeholder={field.placeholder}
          rows={field.type === 'json' ? 5 : 3}
          {...registration}
        />
      ) : field.type === 'select' ? (
        <Select
          {...registration}
          value={field.name === 'inventoryMode' ? String(watch(field.name) ?? '') : undefined}
        >
          <option value="">请选择</option>
          {choices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.type === 'multiselect' ? (
        <Select multiple size={Math.min(Math.max(choices.length, 3), 6)} {...registration}>
          {choices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <div className={field.name === 'weight' ? 'input-with-suffix' : undefined}>
          <Input
            placeholder={field.placeholder}
            type={field.type === 'number' ? 'number' : 'text'}
            {...registration}
          />
          {field.name === 'weight' ? <span>g</span> : null}
        </div>
      )}
    </Field>
  );
}

export function MasterDataFormDialog({
  config,
  row,
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  config: MasterConfig;
  row?: MasterRow;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: Record<string, unknown>) => Promise<MasterRow>;
}) {
  const notify = useToast();
  const isProduct = config.resource === 'products';
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [savedProduct, setSavedProduct] = useState<MasterRow>();
  const productId = isProduct ? (row?.id ?? savedProduct?.id) : undefined;
  const images = useProductImages(productId);
  const imageMutations = useProductImageMutations();
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: zodResolver(config.schema as ZodType<FieldValues, FieldValues>),
    defaultValues: rowDefaults(config, row),
  });

  useEffect(() => {
    reset(rowDefaults(config, row));
    setImageFiles([]);
    setSavedProduct(undefined);
  }, [config, open, reset, row]);

  const submit = async (values: FieldValues) => {
    const payload: Record<string, unknown> = { ...values };
    if (typeof payload.attributes === 'string') payload.attributes = JSON.parse(payload.attributes);
    for (const field of config.fields) {
      if ((field.type === 'select' || field.optionResource) && payload[field.name] === '')
        payload[field.name] = null;
    }
    if (payload.weight === '') payload.weight = null;
    try {
      const saved = savedProduct ?? (await onSave(payload));
      if (isProduct && imageFiles.length) {
        setSavedProduct(saved);
        await imageMutations.upload.mutateAsync({ productId: saved.id, files: imageFiles });
        setImageFiles([]);
      }
      notify(row ? '资料已更新' : '资料已创建', 'success');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  const imagePending = imageMutations.upload.isPending || imageMutations.remove.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup">
            <header className="dialog-header">
              <div>
                <Dialog.Title>{row ? `编辑${config.title}` : `新增${config.title}`}</Dialog.Title>
                <Dialog.Description>{config.description}</Dialog.Description>
              </div>
              <Dialog.Close aria-label="关闭" className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </header>
            <form className="dialog-form" onSubmit={handleSubmit(submit)}>
              <div className="form-grid">
                {config.fields.map((field) => (
                  <DynamicField
                    error={String(errors[field.name]?.message ?? '') || undefined}
                    field={field}
                    key={field.name}
                    register={register}
                    setValue={setValue}
                    watch={watch}
                  />
                ))}
                {config.resource === 'sales-channels' ? (
                  <InventoryModeGuide
                    onSelect={(inventoryMode) =>
                      setValue('inventoryMode', inventoryMode, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }
                    value={String(watch('inventoryMode') ?? '')}
                  />
                ) : null}
                {isProduct ? (
                  <Field label="产品图片">
                    <div className="product-image-editor">
                      <label className="gallery-file-picker">
                        <ImagePlus size={16} />
                        <span>
                          {imageFiles.length
                            ? `已选择 ${imageFiles.length} 张图片`
                            : '选择 JPG、PNG 或 WebP 图片'}
                        </span>
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={(event) =>
                            setImageFiles(
                              Array.from(event.target.files ?? []).slice(
                                0,
                                12 - (images.data?.length ?? 0),
                              ),
                            )
                          }
                          type="file"
                        />
                      </label>
                      <small className="muted">
                        单张不超过 10 MB；保存后上传，第一张图片为主图。
                      </small>
                      {imageFiles.length ? (
                        <div className="product-image-grid product-image-editor-grid">
                          {imageFiles.map((file) => (
                            <PendingProductImageCard
                              file={file}
                              key={`${file.name}-${file.lastModified}`}
                              onRemove={() =>
                                setImageFiles((current) => current.filter((item) => item !== file))
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                      {productId && images.data?.length ? (
                        <div className="product-image-grid product-image-editor-grid">
                          {images.data.map((image) => (
                            <ProductImageCard
                              image={image}
                              key={image.id}
                              onRemove={() =>
                                void imageMutations.remove
                                  .mutateAsync({ productId, imageId: image.id })
                                  .catch((error) => notify(apiErrorMessage(error), 'error'))
                              }
                              pending={imagePending}
                              productId={productId}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Field>
                ) : null}
              </div>
              <footer className="dialog-footer">
                <Dialog.Close className="button button-ghost">取消</Dialog.Close>
                <Button disabled={pending || imagePending} type="submit">
                  {pending || imagePending ? '正在保存…' : '保存'}
                </Button>
              </footer>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
