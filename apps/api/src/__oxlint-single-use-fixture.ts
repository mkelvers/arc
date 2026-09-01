// oxlint-disable-next-line anti-slop/no-single-use-function -- intentional rule fixture
function timestamp(value: Date | null) {
    return value?.toISOString() ?? null;
}

timestamp(new Date());
