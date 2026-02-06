import { useMemo, useState } from 'react'
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory
} from '../hooks/useCategories'
import { Category } from '../api/client'

export default function Categories() {
  const { data: categories, isLoading } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const categoryMap = useMemo(() => {
    const map = new Map<number, Category>()
    categories?.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categories])

  const ordered = useMemo(() => {
    if (!categories) return []
    return [...categories].sort((a, b) => {
      if (a.display_order !== b.display_order) {
        return a.display_order - b.display_order
      }
      return a.name.localeCompare(b.name)
    })
  }, [categories])

  const parentCategories = useMemo(() => {
    return ordered.filter((category) => category.parent_id === null)
  }, [ordered])

  const childrenByParent = useMemo(() => {
    const map = new Map<number, Category[]>()
    for (const category of ordered) {
      if (category.parent_id !== null) {
        const list = map.get(category.parent_id) ?? []
        list.push(category)
        map.set(category.parent_id, list)
      }
    }
    return map
  }, [ordered])

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Categories</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Category
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-gray-500">Loading categories...</div>
        ) : (
          <div className="space-y-3">
            {showAdd && (
              <CategoryForm
                categories={ordered}
                onSave={async (data) => {
                  await createMutation.mutateAsync(data)
                  setShowAdd(false)
                }}
                onCancel={() => setShowAdd(false)}
                isSaving={createMutation.isPending}
              />
            )}

            {(!ordered || ordered.length === 0) && !showAdd && (
              <div className="text-center py-12 text-gray-500">
                No categories defined yet. Add one to get started.
              </div>
            )}

            {parentCategories.map((category) => (
              <div key={category.id} className="space-y-2">
                {editingId === category.id ? (
                  <CategoryForm
                    category={category}
                    categories={ordered}
                    onSave={async (data) => {
                      await updateMutation.mutateAsync({ id: category.id, ...data })
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                    isSaving={updateMutation.isPending}
                  />
                ) : (
                  <CategoryCard
                    category={category}
                    parentName="—"
                    onEdit={() => setEditingId(category.id)}
                    onDelete={async () => {
                      try {
                        await deleteMutation.mutateAsync(category.id)
                      } catch (error) {
                        console.error('Failed to delete category', error)
                        window.alert('Cannot delete category. It may have subcategories.')
                      }
                    }}
                  />
                )}

                {(childrenByParent.get(category.id) || []).map((child) =>
                  editingId === child.id ? (
                    <div key={child.id} className="ml-6">
                      <CategoryForm
                        category={child}
                        categories={ordered}
                        onSave={async (data) => {
                          await updateMutation.mutateAsync({ id: child.id, ...data })
                          setEditingId(null)
                        }}
                        onCancel={() => setEditingId(null)}
                        isSaving={updateMutation.isPending}
                      />
                    </div>
                  ) : (
                    <div key={child.id} className="ml-6">
                      <CategoryCard
                        category={child}
                        parentName={categoryMap.get(child.parent_id ?? 0)?.name || '—'}
                        onEdit={() => setEditingId(child.id)}
                        onDelete={async () => {
                          try {
                            await deleteMutation.mutateAsync(child.id)
                          } catch (error) {
                            console.error('Failed to delete category', error)
                            window.alert('Cannot delete category. It may have subcategories.')
                          }
                        }}
                      />
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryCard({
  category,
  parentName,
  onEdit,
  onDelete
}: {
  category: Category
  parentName: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white border rounded-lg p-4 group">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-lg">{category.name}</h3>
          <div className="mt-1 text-sm text-gray-500">
            Parent: {parentName}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Display order: {category.display_order}
          </div>
        </div>
        <div className="invisible group-hover:visible flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function CategoryForm({
  category,
  categories,
  onSave,
  onCancel,
  isSaving
}: {
  category?: Category
  categories: Category[]
  onSave: (data: { name: string; parent_id: number | null; display_order: number }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [name, setName] = useState(category?.name || '')
  const [parentId, setParentId] = useState<number | null>(category?.parent_id ?? null)
  const [displayOrder, setDisplayOrder] = useState<number>(category?.display_order ?? 0)

  const availableParents = useMemo(() => {
    if (!category) return categories
    return categories.filter((item) => item.id !== category.id)
  }, [categories, category])

  const handleSubmit = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      parent_id: parentId,
      display_order: displayOrder
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Groceries"
            className="w-full px-3 py-2 border border-gray-300 rounded"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Parent Category
          </label>
          <select
            value={parentId ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setParentId(value ? Number(value) : null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded"
          >
            <option value="">None</option>
            {availableParents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display Order
          </label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value))}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 rounded"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : category ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  )
}
